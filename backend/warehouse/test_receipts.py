"""Tests for "Ontvangst in ons magazijn": which ordered products reached the
warehouse (warehouse/receipts.py), the customer's overview endpoint
(accounts/views.py PackageViewSet.order_overview) and the warehouse's
counting endpoint (warehouse/views.py IntakeSheetViewSet.products).

The cases the feature promises:
  * fully received (also over two deliveries, added up);
  * partially received ("5 besteld · 3 ontvangen · 2 nog verwacht");
  * zero received;
  * unknown, for an older order and for goods that came in uncounted;
  * the products show before there is an invoice;
  * nobody sees another customer's invoice or products;
  * only warehouse/office accounts can change counts, and a count can only
    go on an order line of the sheet's own order;
  * a correction shows the next time the page is loaded.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from accounts.models import Package
from bookings.models import BookingOrder, BookingProduct
from config.testing import WarehouseAPITestCase
from invoicing.models import Invoice

from . import receipts
from .models import IntakeSheet, ProductReceipt, ProductReceiptChange
from .test_customers import make_booking, make_user

User = get_user_model()


def overview_url(package):
    return reverse("package-order-overview", args=[package.pk])


def counts_url(sheet):
    return reverse("staff-intake-products", args=[sheet.pk])


class StatusRuleTests(WarehouseAPITestCase):
    """The rule on its own, with the worked example from the request."""

    def test_the_four_statuses(self):
        self.assertEqual(receipts.status_for(5, 5), receipts.RECEIVED)
        self.assertEqual(receipts.status_for(5, 7), receipts.RECEIVED)
        self.assertEqual(receipts.status_for(5, 3), receipts.PARTIAL)
        self.assertEqual(receipts.status_for(5, 0), receipts.NOT_RECEIVED)
        self.assertEqual(receipts.status_for(5, None), receipts.UNKNOWN)
        self.assertEqual(receipts.status_for(None, 2), receipts.UNKNOWN)

    def test_still_expected_never_goes_below_zero(self):
        self.assertEqual(receipts.still_expected(5, 3), 2)
        self.assertEqual(receipts.still_expected(5, 7), 0)
        self.assertIsNone(receipts.still_expected(5, None))


class ReceiptsTestCase(WarehouseAPITestCase):
    def setUp(self):
        self.customer = make_user("klant@example.com", first_name="Klaas")
        self.other = make_user("ander@example.com", first_name="Anna")
        self.worker = make_user("wim@example.com", role="warehouse", first_name="Wim")
        self.manager = make_user("chef@example.com", role="manager", first_name="Mila")

        self.package = Package.objects.create(
            user=self.customer,
            tracking_number="PLSM-00010",
            status=Package.Status.PAID,
            warehouse_stage=Package.WarehouseStage.AWAITING_PICKUP,
        )
        self.booking = make_booking(self.customer, "PLSM-00010", package=self.package)
        self.chairs = self.add_product(self.booking, "Chair", 5)
        self.table = self.add_product(self.booking, "Table", 1)
        self.lamp = self.add_product(self.booking, "Lamp", 2)

        # Two deliveries for this order.
        self.monday = IntakeSheet.objects.create(reference="PLSM-00010", booking=self.booking, package=self.package)
        self.friday = IntakeSheet.objects.create(reference="PLSM-00010", booking=self.booking)

    def add_product(self, booking, description, quantity, shop="Ikea"):
        order, _ = BookingOrder.objects.get_or_create(
            booking=booking, shop_name=shop, defaults={"description": shop}
        )
        return BookingProduct.objects.create(
            order=order, booking=booking, description=description, quantity=quantity
        )

    def count(self, sheet, counts, user=None):
        self.client.force_authenticate(user or self.worker)
        response = self.client.put(
            counts_url(sheet),
            {"counts": [{"product": product.pk, "quantity": quantity} for product, quantity in counts]},
            format="json",
        )
        self.client.force_authenticate(None)
        return response

    def overview(self, user=None, package=None):
        self.client.force_authenticate(user or self.customer)
        response = self.client.get(overview_url(package or self.package))
        self.client.force_authenticate(None)
        return response

    def lines(self):
        response = self.overview()
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return {line["name"]: line for line in response.data["products"]}


class CustomerOverviewTests(ReceiptsTestCase):
    def test_nothing_arrived_yet_every_product_is_not_received(self):
        lines = self.lines()
        self.assertEqual(list(lines), ["Chair", "Table", "Lamp"])
        for line in lines.values():
            self.assertEqual(line["received"], 0)
            self.assertEqual(line["status"], receipts.NOT_RECEIVED)
        self.assertEqual(lines["Chair"]["expected"], 5)

    def test_fully_partially_and_zero_received(self):
        # Monday: 3 chairs, the table, no lamps.
        self.assertEqual(
            self.count(self.monday, [(self.chairs, 3), (self.table, 1), (self.lamp, 0)]).status_code,
            status.HTTP_200_OK,
        )
        lines = self.lines()
        # 5 besteld · 3 ontvangen · 2 nog verwacht -> Gedeeltelijk ontvangen
        self.assertEqual(
            (lines["Chair"]["ordered"], lines["Chair"]["received"], lines["Chair"]["expected"]), (5, 3, 2)
        )
        self.assertEqual(lines["Chair"]["status"], receipts.PARTIAL)
        self.assertEqual(lines["Table"]["status"], receipts.RECEIVED)
        self.assertEqual(lines["Lamp"]["received"], 0)
        self.assertEqual(lines["Lamp"]["status"], receipts.NOT_RECEIVED)

    def test_two_deliveries_are_added_up(self):
        self.count(self.monday, [(self.chairs, 3)])
        self.count(self.friday, [(self.chairs, 2)])
        chair = self.lines()["Chair"]
        self.assertEqual((chair["received"], chair["expected"], chair["status"]), (5, 0, receipts.RECEIVED))

    def test_a_correction_shows_on_the_next_load(self):
        self.count(self.monday, [(self.chairs, 3)])
        self.assertEqual(self.lines()["Chair"]["received"], 3)
        # The worker miscounted: it was 4.
        self.count(self.monday, [(self.chairs, 4)], user=self.manager)
        self.assertEqual(self.lines()["Chair"]["received"], 4)
        # One row per delivery, and the history keeps both versions.
        self.assertEqual(ProductReceipt.objects.filter(product=self.chairs).count(), 1)
        changes = list(
            ProductReceiptChange.objects.filter(product=self.chairs).order_by("id").values_list(
                "quantity_before", "quantity_after"
            )
        )
        self.assertEqual(changes, [(None, 3), (3, 4)])

    def test_an_unchanged_count_is_not_logged_again(self):
        self.count(self.monday, [(self.chairs, 3)])
        self.count(self.monday, [(self.chairs, 3)])
        self.assertEqual(ProductReceiptChange.objects.filter(product=self.chairs).count(), 1)

    def test_an_archived_delivery_does_not_count(self):
        self.count(self.monday, [(self.chairs, 3)])
        IntakeSheet.objects.filter(pk=self.monday.pk).update(archived_at=timezone.now())
        self.assertEqual(self.lines()["Chair"]["received"], 0)

    def test_goods_scanned_in_but_not_counted_is_unknown(self):
        # The package was scanned in: a box arrived, nobody opened it.
        Package.objects.filter(pk=self.package.pk).update(warehouse_stage=Package.WarehouseStage.RECEIVED)
        lines = self.lines()
        self.assertEqual(lines["Chair"]["status"], receipts.UNKNOWN)
        self.assertIsNone(lines["Chair"]["received"])
        self.assertIsNone(lines["Chair"]["expected"])
        # Once counted, the counted product is known; the rest stay unknown.
        self.count(self.monday, [(self.chairs, 2)])
        lines = self.lines()
        self.assertEqual(lines["Chair"]["status"], receipts.PARTIAL)
        self.assertEqual(lines["Table"]["status"], receipts.UNKNOWN)

    def test_a_released_sheet_without_counts_is_unknown(self):
        self.monday.release()
        self.assertEqual(self.lines()["Lamp"]["status"], receipts.UNKNOWN)

    def test_an_older_booking_without_order_lines_is_unknown(self):
        old_package = Package.objects.create(
            user=self.customer, tracking_number="PLS-0001", status=Package.Status.DELIVERED
        )
        old = make_booking(self.customer, "PLS-0001", package=old_package, contents="Kleding")
        BookingOrder.objects.create(booking=old, shop_name="Zalando", description="Two jackets")
        response = self.overview(package=old_package)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        [line] = response.data["products"]
        self.assertEqual((line["name"], line["store"]), ("Two jackets", "Zalando"))
        self.assertEqual(line["status"], receipts.UNKNOWN)
        self.assertIsNone(line["ordered"])

    def test_a_shipment_without_a_booking_is_unknown(self):
        bare = Package.objects.create(user=self.customer, tracking_number="PLS-0002", description="Boxes")
        [line] = self.overview(package=bare).data["products"]
        self.assertEqual((line["name"], line["status"]), ("Boxes", receipts.UNKNOWN))


class InvoiceInOverviewTests(ReceiptsTestCase):
    def test_products_show_before_the_invoice_is_available(self):
        response = self.overview()
        self.assertIsNone(response.data["invoice"])
        self.assertEqual(len(response.data["products"]), 3)

    def test_an_invoice_still_in_review_is_not_shown(self):
        Invoice.objects.create(package=self.package, status=Invoice.Status.PENDING_REVIEW)
        self.assertIsNone(self.overview().data["invoice"])

    def test_a_sent_invoice_is_shown_with_its_download_link(self):
        invoice = Invoice.objects.create(
            package=self.package,
            status=Invoice.Status.SENT,
            sent_at=timezone.now(),
            reviewed_by=self.manager,
            reviewed_at=timezone.now(),
            pdf="invoices/2026/test.pdf",
        )
        data = self.overview().data["invoice"]
        self.assertEqual(data["id"], invoice.pk)
        self.assertEqual(data["download_url"], reverse("invoice-pdf", args=[invoice.pk]))
        self.assertEqual(data["lines"], [])


class PermissionTests(ReceiptsTestCase):
    def test_another_customer_gets_a_404_not_the_products_or_invoice(self):
        response = self.overview(user=self.other)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("products", response.data)

    def test_another_customers_invoice_pdf_is_a_404(self):
        invoice = Invoice.objects.create(
            package=self.package,
            status=Invoice.Status.SENT,
            sent_at=timezone.now(),
            reviewed_by=self.manager,
            reviewed_at=timezone.now(),
            pdf="invoices/2026/test.pdf",
        )
        self.client.force_authenticate(self.other)
        response = self.client.get(reverse("invoice-pdf", args=[invoice.pk]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_signed_out_is_refused(self):
        response = self.client.get(overview_url(self.package))
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_a_customer_cannot_read_or_change_counts(self):
        response = self.count(self.monday, [(self.chairs, 5)], user=self.customer)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get(counts_url(self.monday)).status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(ProductReceipt.objects.exists())

    def test_workers_and_managers_can_count(self):
        self.assertEqual(self.count(self.monday, [(self.chairs, 1)]).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.count(self.monday, [(self.chairs, 2)], user=self.manager).status_code, status.HTTP_200_OK
        )


class MatchingTests(ReceiptsTestCase):
    def test_the_same_product_on_another_order_is_kept_apart(self):
        # Another customer ordered the very same chair.
        other_package = Package.objects.create(user=self.other, tracking_number="PLSM-00011")
        other_booking = make_booking(self.other, "PLSM-00011", package=other_package)
        other_chairs = self.add_product(other_booking, "Chair", 5)
        other_sheet = IntakeSheet.objects.create(reference="PLSM-00011", booking=other_booking)

        self.count(other_sheet, [(other_chairs, 5)])
        self.count(self.monday, [(self.chairs, 1)])

        self.assertEqual(self.lines()["Chair"]["received"], 1)
        [theirs] = self.overview(user=self.other, package=other_package).data["products"]
        self.assertEqual(theirs["received"], 5)

    def test_a_count_for_another_orders_line_is_refused(self):
        other_booking = make_booking(self.other, "PLSM-00012")
        other_chairs = self.add_product(other_booking, "Chair", 5)
        response = self.count(self.monday, [(other_chairs, 5)])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ProductReceipt.objects.exists())

    def test_bad_counts_are_refused_and_nothing_is_saved(self):
        for counts in (
            [(self.chairs, -1)],
            [(self.chairs, receipts.MAX_COUNT + 1)],
            [(self.chairs, 1), (self.chairs, 2)],
        ):
            with self.subTest(counts=counts):
                response = self.count(self.monday, counts)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ProductReceipt.objects.exists())

    def test_an_archived_sheet_cannot_be_counted(self):
        IntakeSheet.objects.filter(pk=self.monday.pk).update(archived_at=timezone.now())
        self.assertEqual(self.count(self.monday, [(self.chairs, 1)]).status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_sheet_without_a_booking_has_nothing_to_count(self):
        loose = IntakeSheet.objects.create(reference="BOX-1")
        self.client.force_authenticate(self.worker)
        response = self.client.get(counts_url(loose))
        self.assertEqual(response.data, {"booking": None, "lines": []})
        self.assertEqual(self.count(loose, [(self.chairs, 1)]).status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_staff_view_shows_this_delivery_and_the_others(self):
        self.count(self.friday, [(self.chairs, 2)])
        self.count(self.monday, [(self.chairs, 3)])
        self.client.force_authenticate(self.worker)
        data = self.client.get(counts_url(self.monday)).data
        chair = next(line for line in data["lines"] if line["name"] == "Chair")
        self.assertEqual(
            (chair["counted_here"], chair["counted_elsewhere"], chair["received"], chair["status"]),
            (3, 2, 5, receipts.RECEIVED),
        )
        self.assertEqual(chair["confirmed_by"], "Wim")
        table = next(line for line in data["lines"] if line["name"] == "Table")
        self.assertIsNone(table["counted_here"])


class OfficeBookingPageTests(ReceiptsTestCase):
    """Dashboard -> Bookings shows the same rows as the customer's page."""

    def test_the_booking_shows_what_the_warehouse_counted(self):
        self.count(self.monday, [(self.chairs, 3)])
        office = make_user("kantoor@example.com", role="office")
        self.client.force_authenticate(office)
        data = self.client.get(reverse("staff-booking-detail", args=[self.booking.pk])).data
        rows = {row["name"]: row for row in data["received_products"]}
        self.assertEqual(
            (rows["Chair"]["ordered"], rows["Chair"]["received"], rows["Chair"]["expected"]), (5, 3, 2)
        )
        self.assertEqual(rows["Chair"]["status"], receipts.PARTIAL)
        # Identical to what the customer sees.
        self.assertEqual(data["received_products"], self.overview().data["products"])


class OfficeReceivedButtonTests(ReceiptsTestCase):
    """The admin's "Bestelling ontvangen" / "Product ontvangen" buttons on
    Dashboard -> Bookings (staff/views.py BookingViewSet._mark_received)."""

    def setUp(self):
        super().setUp()
        self.admin = make_user("admin@example.com", role="admin", first_name="Ada")
        self.office = make_user("kantoor@example.com", role="office")
        self.order = self.chairs.order

    def press(self, kind, row, received=True, user=None):
        self.client.force_authenticate(user or self.admin)
        response = self.client.post(
            reverse(f"staff-booking-{kind}-received", args=[self.booking.pk, row.pk]),
            {"received": received},
            format="json",
        )
        self.client.force_authenticate(None)
        return response

    def test_one_product_received_shows_to_the_customer(self):
        response = self.press("product", self.lamp)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        lines = self.lines()
        self.assertEqual((lines["Lamp"]["received"], lines["Lamp"]["status"]), (2, receipts.RECEIVED))
        # Only that product: the rest of the store order is not received.
        self.assertEqual(lines["Chair"]["status"], receipts.NOT_RECEIVED)
        # The office sees who pressed it.
        product = next(p for o in response.data["orders"] for p in o["products"] if p["id"] == self.lamp.pk)
        self.assertEqual(product["received_by_name"], "Ada")

    def test_the_whole_store_order_received(self):
        self.count(self.monday, [(self.chairs, 3)])
        self.assertEqual(self.press("order", self.order).status_code, status.HTTP_200_OK)
        for line in self.lines().values():
            self.assertEqual(line["status"], receipts.RECEIVED)
        self.assertEqual(self.lines()["Chair"]["received"], 5)

    def test_it_can_be_undone(self):
        self.press("order", self.order)
        self.press("order", self.order, received=False)
        self.assertEqual(self.lines()["Chair"]["status"], receipts.NOT_RECEIVED)

    def test_the_customer_sees_it_on_my_bookings_too(self):
        # "My bookings" lists bookings that are not a shipment yet.
        self.booking.package = None
        self.booking.save(update_fields=["package"])
        self.press("product", self.lamp)
        self.client.force_authenticate(self.customer)
        data = self.client.get(reverse("my-bookings")).data
        rows = data["results"] if isinstance(data, dict) else data
        products = [p for b in rows for o in b["orders"] for p in o["products"]]
        lamp = next(p for p in products if p["id"] == self.lamp.pk)
        self.assertIsNotNone(lamp["received_at"])
        # Who pressed it is the office's business only.
        self.assertNotIn("received_by_name", lamp)

    def test_only_an_admin_can_press_it(self):
        for user in (self.office, self.worker, self.customer):
            with self.subTest(user=user.email):
                response = self.press("product", self.lamp, user=user)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.lamp.refresh_from_db()
        self.assertIsNone(self.lamp.received_at)

    def test_a_product_of_another_booking_is_a_404(self):
        other = make_booking(self.other, "PLSM-00099")
        theirs = self.add_product(other, "Chair", 1)
        self.assertEqual(self.press("product", theirs).status_code, status.HTTP_404_NOT_FOUND)

    def test_received_must_be_true_or_false(self):
        self.assertEqual(self.press("product", self.lamp, received="yes").status_code, status.HTTP_400_BAD_REQUEST)

    def test_an_older_store_row_shows_received(self):
        old_package = Package.objects.create(user=self.customer, tracking_number="PLS-0005")
        old = make_booking(self.customer, "PLS-0005", package=old_package)
        order = BookingOrder.objects.create(booking=old, shop_name="Bol.com", description="Laptop")
        self.client.force_authenticate(self.admin)
        self.client.post(
            reverse("staff-booking-order-received", args=[old.pk, order.pk]), {"received": True}, format="json"
        )
        [line] = self.overview(package=old_package).data["products"]
        self.assertEqual(line["status"], receipts.RECEIVED)

    def test_the_customers_invoice_document_shows_on_the_booking(self):
        from django.core.files.base import ContentFile

        from bookings.models import BookingAttachment

        attachment = BookingAttachment(
            booking=self.booking,
            order=self.order,
            kind=BookingAttachment.Kind.INVOICE,
            original_name="factuur-bol.pdf",
            content_type="application/pdf",
        )
        attachment.file.save("f.pdf", ContentFile(b"%PDF-1.4"), save=True)
        try:
            self.client.force_authenticate(self.admin)
            data = self.client.get(reverse("staff-booking-detail", args=[self.booking.pk])).data
            [order] = data["orders"]
            self.assertEqual([(d["kind"], d["name"]) for d in order["documents"]], [("invoice", "factuur-bol.pdf")])
        finally:
            attachment.file.delete(save=False)


class ReceivedNotificationTests(OfficeReceivedButtonTests):
    """Pressing "Product ontvangen" / "Bestelling ontvangen" tells the customer
    (notifications/services.py notify_item_received): a bell row and an
    e-mail in their language, once per press."""

    def press(self, *args, **kwargs):
        # The e-mail is sent from a transaction.on_commit hook, which a test
        # only runs when asked to (as in notifications/test_language_and_received.py).
        with self.captureOnCommitCallbacks(execute=True):
            return super().press(*args, **kwargs)

    def notes(self):
        from notifications.models import Notification

        return list(Notification.objects.filter(user=self.customer).order_by("id"))

    def test_pressing_a_product_notifies_the_customer_once(self):
        from django.core import mail

        self.press("product", self.lamp)
        [note] = self.notes()
        self.assertEqual(note.context["status"], "item_received")
        self.assertEqual((note.context["item"], note.context["shop"]), ("Lamp", "Ikea"))
        self.assertEqual(note.package, self.package)
        # The e-mail names what arrived, in Dutch (no language set yet).
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Een product van uw bestelling is aangekomen", mail.outbox[0].subject)
        self.assertIn("Lamp (van Ikea)", mail.outbox[0].body)

    def test_pressing_again_does_not_notify_twice(self):
        self.press("product", self.lamp)
        self.press("product", self.lamp)  # already received: nothing changes
        self.assertEqual(len(self.notes()), 1)

    def test_undo_sends_nothing_and_a_new_press_notifies_again(self):
        self.press("product", self.lamp)
        self.press("product", self.lamp, received=False)
        self.assertEqual(len(self.notes()), 1)
        self.press("product", self.lamp)
        self.assertEqual(len(self.notes()), 2)

    def test_the_whole_order_has_its_own_message(self):
        self.press("order", self.order)
        [note] = self.notes()
        self.assertEqual(note.context["status"], "order_received")

    def test_english_and_papiamentu_customers_get_their_language(self):
        from django.core import mail

        for language, expected in (("en", "has arrived at our warehouse"), ("pap", "a yega na nos depósito")):
            with self.subTest(language=language):
                mail.outbox.clear()
                self.customer.language = language
                self.customer.save(update_fields=["language"])
                self.press("product", self.lamp)
                self.assertIn(expected, mail.outbox[-1].subject)
                self.assertIn("Lamp", mail.outbox[-1].body)
                self.press("product", self.lamp, received=False)

    def test_a_stray_brace_in_the_item_name_does_not_break_the_mail(self):
        from django.core import mail

        self.lamp.description = "Lamp {shop} {0}"
        self.lamp.save(update_fields=["description"])
        self.press("product", self.lamp)
        self.assertIn("Lamp {shop} {0}", mail.outbox[0].body)

    def test_the_shipping_e_mail_preference_is_respected_but_the_bell_row_stays(self):
        from django.core import mail

        self.customer.notify_shipping = False
        self.customer.save(update_fields=["notify_shipping"])
        self.press("product", self.lamp)
        self.assertEqual(len(self.notes()), 1)
        self.assertEqual(mail.outbox, [])

    def test_a_booking_without_an_account_notifies_nobody(self):
        from notifications.models import Notification

        self.booking.user = None
        self.booking.save(update_fields=["user"])
        response = self.press("product", self.lamp)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Notification.objects.count(), 0)

    def test_a_refused_press_notifies_nobody(self):
        self.press("product", self.lamp, user=self.office)
        self.assertEqual(self.notes(), [])
