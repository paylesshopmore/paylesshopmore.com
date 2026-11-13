"""Tests for the invoice editor's API (staff/invoice_editor.py).

What is covered, by class:

* ComposeTests      - saving a new invoice: lines, totals, the pairing rule,
                      duplicates, sending, history.
* VatTests          - 0% only for a verified export; the standard rate
                      otherwise; rates come from the settings, not the browser.
* AdjustmentTests   - negative and positive adjustments; admins only.
* InsuranceTests    - premium from a configured rate, or typed by hand.
* PackageTests      - multiple measured packages, and missing shipment data.
* NumberingTests    - gapless numbers, configurable format.
* EditTests         - correcting an invoice keeps its number; locked once sent.
* DeleteTests       - admins only, unsent only, recorded in the history.
* PreviewTests      - the PDF contains what the preview showed.
* DefaultsTests     - what the form starts with, and finding shipments.
* ConfigTests       - everyone reads the settings, only admins change them.
"""

import base64
import re
from datetime import date
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from accounts.models import Package, User
from bookings.models import Booking

from .models import Invoice, InvoiceHistory, InvoiceNumberSequence, InvoiceSettings, Port
from .pdf import invoice_number, render_invoice_pdf
from .test_manual_invoices import ManualInvoiceTestCase, make_user

STANDARD_LINES = [
    {"kind": "charge", "description": "Zeevracht", "amount": "850.00"},
    {"kind": "charge", "description": "Administratie", "amount": "35.00"},
    {"kind": "charge", "description": "Handling Fee", "amount": "485.48"},
]


class EditorTestCase(ManualInvoiceTestCase):
    """The customers and shipments from ManualInvoiceTestCase, an admin, and helpers."""

    def setUp(self):
        super().setUp()
        # self.staff (from the parent class) is made an office worker - an
        # is_staff account with no role counts as an admin (see
        # User._role_from_flags). self.admin is for what only admins may do.
        self.staff.role = User.Role.OFFICE
        self.staff.save()
        self.admin = make_user("admin@example.com", is_staff=True)
        self.admin.role = User.Role.ADMIN
        self.admin.save()

    def payload(self, **overrides):
        body = {
            "customer": self.john.pk,
            "package": self.johns.pk,
            "status": "pending_review",
            "invoice_date": "2026-10-07",
            "bill_to": "John Smith\nKaya Grandi 1\nCuraçao",
            "phone": "+599 9 123 4567",
            "relation_number": "PLSM0009",
            "order_number": "PLSM0011",
            "shipment_number": "CIT-SE-006648",
            "freight": "sea",
            "port_of_loading": "Rotterdam, NL",
            "port_of_discharge": "Willemstad, CUR",
            "goods_description": "Dry Aging fridge and stove",
            "pieces": 2,
            "weight_kg": "199",
            "volume_m3": "1.55",
            "export_verified": True,
            "lines": STANDARD_LINES,
        }
        body.update(overrides)
        return body

    def post(self, name, user=None, **overrides):
        if user is not None:
            self.client.force_authenticate(user)
        return self.client.post(reverse(name), self.payload(**overrides), format="json")

    def compose(self, user=None, **overrides):
        return self.post("staff-invoice-compose", user, **overrides)


class ComposeTests(EditorTestCase):
    def test_it_saves_the_header_and_the_lines_in_order(self):
        response = self.compose()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        invoice = Invoice.objects.get()
        self.assertTrue(invoice.composed)
        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)
        self.assertEqual(invoice.created_by, self.staff)
        self.assertEqual(invoice.invoice_date, date(2026, 10, 7))
        self.assertEqual(invoice.shipment_number, "CIT-SE-006648")
        self.assertEqual(invoice.weight_kg, Decimal("199"))
        self.assertEqual(
            [line.description for line in invoice.lines.all()],
            ["Zeevracht", "Administratie", "Handling Fee"],
        )
        self.assertEqual(invoice.amount_due, Decimal("1370.48"))
        self.assertEqual(response.data["value_eur"], "1370.48")

    def test_the_wording_is_copied_from_the_settings(self):
        self.compose()

        texts = Invoice.objects.get().texts
        self.assertIn("{zendingsnummer}", texts["payment_instructions"])
        self.assertIn("Fenex", texts["terms_items"])

    def test_someone_elses_shipment_is_refused(self):
        response = self.compose(package=self.marys.pk)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("package", response.data)
        self.assertFalse(Invoice.objects.exists())

    def test_a_second_invoice_for_one_shipment_is_a_conflict(self):
        first = self.compose()
        second = self.compose()

        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(str(second.data["existing_invoice"]), str(first.data["id"]))

    def test_an_invoice_with_no_lines_is_refused(self):
        response = self.compose(lines=[])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("lines", response.data)

    def test_a_charge_without_a_description_or_amount_is_refused(self):
        response = self.compose(lines=[{"kind": "charge", "description": "", "amount": None}])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        said = " ".join(str(message) for message in response.data["lines"])
        self.assertIn("needs a description", said)
        self.assertIn("needs an amount", said)

    def test_a_negative_charge_is_refused(self):
        response = self.compose(
            lines=[{"kind": "charge", "description": "Korting", "amount": "-50.00"}]
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot be negative", str(response.data["lines"]))

    def test_a_future_date_is_refused(self):
        response = self.compose(invoice_date="2999-01-01")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("invoice_date", response.data)

    def test_sending_draws_the_pdf_and_sends_it(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.compose(status="sent")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        invoice = Invoice.objects.get()
        self.assertEqual(invoice.status, Invoice.Status.SENT)
        with invoice.pdf.open("rb") as handle:
            self.assertIn(b"PLSM20260001", handle.read())

    def test_customers_cannot_use_it(self):
        response = self.compose(user=self.john)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_the_history_records_the_creation(self):
        self.compose()

        row = InvoiceHistory.objects.get()
        self.assertEqual(row.action, InvoiceHistory.Action.CREATED)
        self.assertEqual(row.actor, self.staff)
        self.assertEqual(row.snapshot["totals"]["total"], "1370.48")


class VatTests(EditorTestCase):
    def test_a_verified_export_is_zero_vat(self):
        self.compose(export_verified=True)

        totals = Invoice.objects.get().totals()
        self.assertEqual(totals["vat"], Decimal("0.00"))
        self.assertEqual(totals["total"], Decimal("1370.48"))

    def test_an_unverified_shipment_gets_the_standard_rate(self):
        self.compose(export_verified=False)

        invoice = Invoice.objects.get()
        self.assertEqual(invoice.vat_rate, Decimal("21.00"))
        self.assertEqual(invoice.totals()["vat"], Decimal("287.80"))
        self.assertEqual(invoice.amount_due, Decimal("1658.28"))

    def test_the_rate_comes_from_the_settings_not_the_browser(self):
        settings_row = InvoiceSettings.load()
        settings_row.standard_vat_rate = Decimal("9.00")
        settings_row.save()

        self.compose(export_verified=False, vat_rate="0")

        self.assertEqual(Invoice.objects.get().vat_rate, Decimal("9.00"))


class AdjustmentTests(EditorTestCase):
    def with_adjustment(self, amount):
        return STANDARD_LINES + [{"kind": "adjustment", "description": "", "amount": amount}]

    def test_an_admin_can_add_a_negative_adjustment(self):
        response = self.compose(user=self.admin, lines=self.with_adjustment("-100.00"))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        invoice = Invoice.objects.get()
        self.assertEqual(invoice.amount_due, Decimal("1270.48"))
        adjustment = invoice.lines.get(kind="adjustment")
        self.assertEqual(adjustment.description, "Contractuele verrekening conform overeenkomst")

    def test_a_positive_adjustment_is_added_not_subtracted(self):
        self.compose(user=self.admin, lines=self.with_adjustment("50.00"))

        self.assertEqual(Invoice.objects.get().amount_due, Decimal("1420.48"))

    def test_an_adjustment_bigger_than_the_charges_is_a_credit(self):
        self.compose(user=self.admin, lines=self.with_adjustment("-2000.00"))

        self.assertEqual(Invoice.objects.get().amount_due, Decimal("-629.52"))

    def test_an_office_worker_cannot_add_one(self):
        response = self.compose(lines=self.with_adjustment("-100.00"))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Only an admin", str(response.data["lines"]))

    def test_an_office_worker_may_edit_an_invoice_with_one_if_they_leave_it_alone(self):
        self.compose(user=self.admin, lines=self.with_adjustment("-100.00"))
        invoice = Invoice.objects.get()
        self.client.force_authenticate(self.staff)
        # As the editor sends it back: the saved wording, unchanged.
        lines = STANDARD_LINES + [
            {
                "kind": "adjustment",
                "description": "Contractuele verrekening conform overeenkomst",
                "amount": "-100.00",
            }
        ]

        response = self.client.put(
            reverse("staff-invoice-edit", args=[invoice.pk]),
            self.payload(lines=lines, goods_description="Fridge"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)


class InsuranceTests(EditorTestCase):
    LINES = STANDARD_LINES + [{"kind": "insurance", "description": "", "amount": None}]

    def test_without_a_rate_the_premium_is_typed_by_hand(self):
        response = self.compose(
            lines=self.LINES, insured_value="8390.00", own_risk="250.00", insurance_fee="125.85"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        line = Invoice.objects.get().lines.get(kind="insurance")
        self.assertEqual(line.amount, Decimal("125.85"))
        self.assertEqual(
            line.description,
            "Verzekering (verzekerde waarde € 8.390,00 - eigen risico € 250,00)",
        )

    def test_without_a_rate_a_missing_premium_is_refused(self):
        response = self.compose(lines=self.LINES, insured_value="8390.00")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("insurance_fee", response.data)

    def test_a_configured_rate_overrules_a_typed_premium(self):
        settings_row = InvoiceSettings.load()
        settings_row.insurance_rate_percent = Decimal("1.5")
        settings_row.insurance_minimum = Decimal("25.00")
        settings_row.save()

        self.compose(lines=self.LINES, insured_value="8390.00", insurance_fee="1.00")

        line = Invoice.objects.get().lines.get(kind="insurance")
        self.assertEqual(line.amount, Decimal("125.85"))

    def test_an_insurance_line_needs_an_insured_value(self):
        response = self.compose(lines=self.LINES, insurance_fee="10.00")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("insured_value", response.data)


class PackageTests(EditorTestCase):
    def test_multiple_measured_packages_give_the_volume(self):
        response = self.compose(
            pieces=None,
            volume_m3=None,
            measurements=[
                {"length_cm": "120", "width_cm": "80", "height_cm": "100", "count": 2},
                {"length_cm": "60", "width_cm": "40", "height_cm": "40", "count": 3},
            ],
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        invoice = Invoice.objects.get()
        self.assertEqual(invoice.pieces, 5)
        self.assertEqual(invoice.volume_m3, Decimal("2.208"))
        self.assertEqual(invoice.volume_weight_kg, Decimal("368.00"))
        # The actual weight stays apart from the volume weight.
        self.assertEqual(invoice.weight_kg, Decimal("199"))

    def test_a_measured_box_needs_real_sizes(self):
        response = self.compose(
            measurements=[{"length_cm": "0", "width_cm": "80", "height_cm": "100", "count": 1}]
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("measurements", response.data)

    def test_missing_shipment_data_still_makes_an_invoice(self):
        response = self.compose(
            bill_to="", phone="", shipment_number="", port_of_loading="",
            port_of_discharge="", goods_description="", pieces=None, weight_kg=None,
            volume_m3=None,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        content = render_invoice_pdf(Invoice.objects.get())
        self.assertTrue(content.startswith(b"%PDF-"))


class NumberingTests(EditorTestCase):
    def test_numbers_run_on_within_a_year(self):
        self.compose()
        self.compose(customer=self.mary.pk, package=self.marys.pk)

        self.assertEqual(
            sorted(Invoice.objects.values_list("reference", flat=True)),
            ["PLSM20260001", "PLSM20260002"],
        )

    def test_the_counter_carries_on_from_paper_invoices(self):
        InvoiceNumberSequence.objects.create(year=2026, last_number=11)

        self.compose()

        self.assertEqual(Invoice.objects.get().reference, "PLSM20260012")

    def test_the_format_is_configurable(self):
        settings_row = InvoiceSettings.load()
        settings_row.number_prefix = "PLS-"
        settings_row.number_include_year = False
        settings_row.number_digits = 6
        settings_row.save()

        self.compose()

        self.assertEqual(Invoice.objects.get().reference, "PLS-000001")

    def test_a_refused_invoice_does_not_use_up_a_number(self):
        self.compose(package=self.marys.pk)
        self.compose()

        self.assertEqual(Invoice.objects.get().reference, "PLSM20260001")

    def test_older_invoices_keep_their_number(self):
        from .services import ensure_invoice_for_package

        anna = make_user("anna@example.com")
        invoice = ensure_invoice_for_package(
            Package.objects.create(user=anna, tracking_number="PLSM-3001")
        )

        self.assertRegex(invoice_number(invoice), r"^INV-\d{4}-\d{5}$")


class EditTests(EditorTestCase):
    def edit(self, invoice, **overrides):
        return self.client.put(
            reverse("staff-invoice-edit", args=[invoice.pk]),
            self.payload(**overrides),
            format="json",
        )

    def test_loading_an_invoice_does_not_take_a_number(self):
        self.compose()
        invoice = Invoice.objects.get()

        response = self.client.get(reverse("staff-invoice-edit", args=[invoice.pk]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["number"], "PLSM20260001")
        self.assertTrue(response.data["editable"])
        self.assertEqual(InvoiceNumberSequence.objects.get(year=2026).last_number, 1)

    def test_a_correction_keeps_the_number(self):
        self.compose()
        invoice = Invoice.objects.get()

        response = self.edit(invoice, lines=STANDARD_LINES[:1])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.reference, "PLSM20260001")
        self.assertEqual(invoice.amount_due, Decimal("850.00"))
        self.assertEqual(
            list(invoice.history.values_list("action", flat=True)), ["updated", "created"]
        )

    def test_a_rejected_invoice_goes_back_to_the_queue_when_corrected(self):
        self.compose()
        invoice = Invoice.objects.get()
        invoice.reject(self.admin, "Wrong weight")

        self.edit(invoice, weight_kg="210")

        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)

    def test_a_sent_invoice_cannot_be_changed(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.compose(status="sent")
        invoice = Invoice.objects.get()

        response = self.edit(invoice)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)


class DeleteTests(EditorTestCase):
    def test_an_admin_can_delete_an_unsent_invoice_and_it_is_recorded(self):
        self.compose()
        invoice = Invoice.objects.get()
        self.client.force_authenticate(self.admin)

        response = self.client.delete(reverse("staff-invoice-detail", args=[invoice.pk]))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Invoice.objects.exists())
        deleted = InvoiceHistory.objects.get(action="deleted")
        self.assertEqual(deleted.reference, "PLSM20260001")
        self.assertEqual(deleted.actor, self.admin)

    def test_an_office_worker_cannot_delete(self):
        self.compose()

        response = self.client.delete(
            reverse("staff-invoice-detail", args=[Invoice.objects.get().pk])
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_sent_invoice_cannot_be_deleted(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.compose(status="sent")
        self.client.force_authenticate(self.admin)

        response = self.client.delete(
            reverse("staff-invoice-detail", args=[Invoice.objects.get().pk])
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)


class PreviewTests(EditorTestCase):
    def test_the_pdf_contains_what_the_preview_shows(self):
        """Every figure the editor displays must also be in the printed PDF."""
        response = self.post(
            "staff-invoice-preview",
            user=self.admin,
            lines=STANDARD_LINES
            + [{"kind": "adjustment", "description": "", "amount": "-100.00"}],
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        content = base64.b64decode(response.data["pdf"])
        self.assertEqual(response.data["totals"]["total"], "1270.48")
        self.assertFalse(Invoice.objects.exists())
        for text in (
            "PLSM20260001", "CIT-SE-006648", "Willemstad, CUR", "Zeevracht",
            "Handling Fee", "€ 1.370,48", "-€ 100,00", "€ 1.270,48",
            "Contractuele verrekening conform overeenkomst",
            "Totaal BTW (0% Export):", "Fenex",
        ):
            with self.subTest(text):
                # In the PDF file, ReportLab writes "€" as the byte \200 and
                # puts a backslash before brackets.
                raw = text.replace("€", "\\200").replace("(", "\\(").replace(")", "\\)")
                self.assertIn(raw.encode("latin-1"), content)

    def test_calculate_answers_the_servers_totals(self):
        response = self.post("staff-invoice-calculate", export_verified=False)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["totals"]["vat"], "287.80")
        self.assertEqual(response.data["totals"]["total"], "1658.28")

    def test_it_draws_a_long_invoice_over_more_than_one_page(self):
        lines = [
            {"kind": "charge", "description": f"Regel {i}", "amount": "10.00"} for i in range(60)
        ]

        response = self.post("staff-invoice-preview", lines=lines)

        self.assertIn(b"vervolg", base64.b64decode(response.data["pdf"]))

    @staticmethod
    def page_count(pdf):
        # Every page of a PDF is an object marked "/Type /Page" ("/Pages",
        # with an s, is the list that holds them, so it is left out).
        return len(re.findall(rb"/Type /Page[^s]", pdf))

    def test_an_ordinary_invoice_fits_on_one_page(self):
        """Thirteen charges - as many as the office's busiest paper invoice -
        with an adjustment and 21% VAT still fit on a single page."""
        lines = [
            {"kind": "charge", "description": f"Regel {i}", "amount": "10.00"} for i in range(13)
        ] + [{"kind": "adjustment", "description": "", "amount": "-5.00"}]

        response = self.post("staff-invoice-preview", user=self.admin, lines=lines, export_verified=False)

        pdf = base64.b64decode(response.data["pdf"])
        self.assertEqual(self.page_count(pdf), 1)
        self.assertNotIn(b"vervolg", pdf)

    def test_only_a_long_invoice_gets_a_second_page(self):
        lines = [
            {"kind": "charge", "description": f"Regel {i}", "amount": "10.00"} for i in range(30)
        ]

        response = self.post("staff-invoice-preview", lines=lines)

        self.assertEqual(self.page_count(base64.b64decode(response.data["pdf"])), 2)


class DefaultsTests(EditorTestCase):
    def defaults(self, package):
        return self.client.get(reverse("staff-invoice-compose-defaults"), {"package": package.pk})

    def booking(self, **extra):
        values = {
            "package": self.johns, "shipping_number": "CIT-SE-006648", "destination": "CW",
            "sender_first_name": "John", "sender_last_name": "Smith",
            "sender_address": "Hertzstraat 1", "sender_postal_code": "2652 XX",
            "sender_city": "Berkel", "sender_phone": "+31612345678",
            "sender_email": "john@example.com", "recipient_first_name": "Jan",
            "recipient_last_name": "Smit", "recipient_address": "Kaya 1",
            "recipient_city": "Willemstad", "recipient_phone": "+59991234567",
            "signature_name": "John Smith",
        }
        values.update(extra)
        return Booking.objects.create(**values)

    def test_it_reads_the_shipment(self):
        data = self.defaults(self.johns).data

        self.assertEqual(data["order_number"], "PLSM-1001")
        self.assertEqual(data["goods_description"], "Een televisie")
        self.assertEqual(data["port_of_loading"], "Rotterdam, NL")
        self.assertEqual(data["port_of_discharge"], "Willemstad, CUR")
        self.assertEqual(data["phone"], "+599 9 123 4567")
        self.assertIsNone(data["existing_invoice"])

    def test_it_reads_the_booking_and_picks_the_port_for_its_island(self):
        self.booking(
            destination=Booking.Destination.ARUBA, quantity=2, volume_m3="1.550",
            insured=True, insured_value_eur="8390.00",
        )

        data = self.defaults(self.johns).data

        self.assertEqual(data["shipment_number"], "CIT-SE-006648")
        self.assertEqual(data["port_of_discharge"], "Oranjestad, ABW")
        self.assertEqual(data["pieces"], 2)
        self.assertEqual(data["insured_value"], "8390.00")

    def test_it_points_at_an_existing_invoice(self):
        self.compose()

        data = self.defaults(self.johns).data

        self.assertEqual(data["existing_invoice"]["number"], "PLSM20260001")

    def test_shipments_can_be_found_by_shipment_number(self):
        self.booking(shipping_number="CIT-SE-777")

        response = self.client.get(reverse("staff-package-list"), {"search": "CIT-SE-777"})

        self.assertEqual([row["id"] for row in response.data["results"]], [self.johns.pk])


class ConfigTests(EditorTestCase):
    def test_staff_can_read_the_configuration(self):
        response = self.client.get(reverse("staff-invoice-settings"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["settings"]["standard_vat_rate"], "21.00")
        self.assertIn("Rotterdam, NL", [port["name"] for port in response.data["ports"]])
        self.assertIn("Zeevracht", [charge["name"] for charge in response.data["charge_types"]])
        self.assertFalse(response.data["permissions"]["can_configure"])

    def test_an_office_worker_cannot_change_the_vat_rate(self):
        response = self.client.put(
            reverse("staff-invoice-settings"), {"standard_vat_rate": "0"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(InvoiceSettings.load().standard_vat_rate, Decimal("21.00"))

    def test_an_admin_can_change_it(self):
        self.client.force_authenticate(self.admin)

        response = self.client.put(
            reverse("staff-invoice-settings"),
            {"standard_vat_rate": "9", "insurance_rate_percent": "1.5"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(InvoiceSettings.load().standard_vat_rate, Decimal("9"))

    def test_an_admin_can_add_a_port_and_an_office_worker_cannot(self):
        body = {"name": "Kingston, JAM", "freight": "sea", "for_discharge": True}

        refused = self.client.post(reverse("staff-invoice-port-list"), body, format="json")
        self.client.force_authenticate(self.admin)
        added = self.client.post(reverse("staff-invoice-port-list"), body, format="json")

        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(added.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Port.objects.filter(name="Kingston, JAM").exists())

    def test_the_company_details_come_from_site_settings(self):
        from accounts.models import SiteSettings

        settings_row = SiteSettings.load()
        settings_row.company_iban = "NL00TEST0000000000"
        settings_row.save()
        self.compose()

        self.assertIn(b"NL00TEST0000000000", render_invoice_pdf(Invoice.objects.get()))


class CompanyDetailsTests(EditorTestCase):
    """KVK, BTW, IBAN and the rest, changed on the dashboard's settings page."""

    def put(self, body, user=None):
        self.client.force_authenticate(user or self.admin)
        return self.client.put(reverse("staff-invoice-settings"), body, format="json")

    def test_an_admin_can_change_the_kvk_and_the_rest(self):
        from accounts.models import SiteSettings

        response = self.put(
            {"company": {"kvk": "1234 5678", "iban": "nl91 abna 0417 1643 00", "phone": "010 000 0000"}}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        # Spaces removed and capitals, the way they are printed.
        self.assertEqual(response.data["company"]["kvk"], "12345678")
        self.assertEqual(response.data["company"]["iban"], "NL91ABNA0417164300")
        row = SiteSettings.load()
        self.assertEqual(row.company_kvk, "12345678")
        self.assertEqual(row.company_phone, "010 000 0000")

    def test_the_next_invoice_prints_the_new_kvk(self):
        self.put({"company": {"kvk": "87654321"}})
        self.client.force_authenticate(self.staff)
        self.compose()

        self.assertIn(b"87654321", render_invoice_pdf(Invoice.objects.get()))

    def test_an_office_worker_cannot_change_it(self):
        from accounts.models import SiteSettings

        response = self.put({"company": {"kvk": "12345678"}}, user=self.staff)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(SiteSettings.load().company_kvk, "9322289")

    def test_a_wrong_iban_is_refused_and_nothing_is_saved(self):
        response = self.put({"standard_vat_rate": "9", "company": {"iban": "not an iban"}})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("iban", response.data["company"])
        # The VAT rate in the same request was not saved either.
        self.assertEqual(InvoiceSettings.load().standard_vat_rate, Decimal("21.00"))

    def test_a_kvk_with_letters_is_refused(self):
        response = self.put({"company": {"kvk": "KVK123"}})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("kvk", response.data["company"])


class AutomaticInvoiceTests(EditorTestCase):
    """An invoice raised automatically when its shipment was paid can be opened
    in the editor, filled in, given its charges, and saved - keeping its number."""

    def automatic(self):
        from .services import ensure_invoice_for_package

        Package.objects.filter(pk=self.johns.pk).update(status=Package.Status.PAID)
        self.johns.refresh_from_db()
        return ensure_invoice_for_package(self.johns)

    def test_it_opens_in_the_editor_filled_in_from_the_shipment(self):
        invoice = self.automatic()
        number = invoice_number(invoice)

        response = self.client.get(reverse("staff-invoice-edit", args=[invoice.pk]))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["editable"])
        self.assertEqual(response.data["number"], number)
        self.assertEqual(response.data["lines"], [])
        self.assertEqual(response.data["order_number"], self.johns.tracking_number)
        invoice.refresh_from_db()
        self.assertFalse(invoice.composed)  # opening it changed nothing

    def test_saving_it_adds_the_charges_and_keeps_the_number(self):
        invoice = self.automatic()
        number = invoice_number(invoice)

        response = self.client.put(
            reverse("staff-invoice-edit", args=[invoice.pk]), self.payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        invoice.refresh_from_db()
        self.assertTrue(invoice.composed)
        self.assertEqual(invoice_number(invoice), number)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(
            [line.description for line in invoice.lines.all()],
            ["Zeevracht", "Administratie", "Handling Fee"],
        )
        self.assertEqual(invoice.amount_due, Decimal("1370.48"))
        self.assertEqual(invoice.status, Invoice.Status.PENDING_REVIEW)

    def test_one_with_an_uploaded_document_stays_out_of_the_editor(self):
        from django.core.files.base import ContentFile

        invoice = self.automatic()
        invoice.pdf.save("upload.pdf", ContentFile(b"%PDF-1.4"), save=True)

        response = self.client.get(reverse("staff-invoice-edit", args=[invoice.pk]))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)


class ChosenNumberTests(EditorTestCase):
    """Writing the invoice number yourself, and setting where the counter is.

    The number box on a NEW invoice starts with the next number (say
    PLSM20260015) and may be changed, to carry on from invoices written
    elsewhere. An admin can also set the counter on the settings page.
    """

    def edit(self, invoice, **overrides):
        return self.client.put(
            reverse("staff-invoice-edit", args=[invoice.pk]),
            self.payload(**overrides),
            format="json",
        )

    def test_the_counter_moves_up_to_a_number_typed_in_our_format(self):
        InvoiceNumberSequence.objects.create(year=2026, last_number=11)

        response = self.compose(number="PLSM20260014")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.compose(customer=self.mary.pk, package=self.marys.pk)

        # 14 was typed, so the invoice after it is 15 - numbering carries on.
        self.assertEqual(
            sorted(Invoice.objects.values_list("reference", flat=True)),
            ["PLSM20260014", "PLSM20260015"],
        )

    def test_a_lower_number_does_not_move_the_counter_back(self):
        InvoiceNumberSequence.objects.create(year=2026, last_number=11)

        self.compose(number="PLSM20260003")

        self.assertEqual(InvoiceNumberSequence.objects.get(year=2026).last_number, 11)

    def test_a_custom_reference_is_kept_and_leaves_the_counter_alone(self):
        InvoiceNumberSequence.objects.create(year=2026, last_number=11)

        self.compose(number="OLD-77")

        self.assertEqual(Invoice.objects.get().reference, "OLD-77")
        self.assertEqual(InvoiceNumberSequence.objects.get(year=2026).last_number, 11)

    def test_a_blank_number_means_the_next_one(self):
        InvoiceNumberSequence.objects.create(year=2026, last_number=11)

        self.compose(number="  ")

        self.assertEqual(Invoice.objects.get().reference, "PLSM20260012")

    def test_a_number_already_used_is_refused_and_nothing_is_saved(self):
        self.compose()  # takes PLSM20260001

        response = self.compose(customer=self.mary.pk, package=self.marys.pk, number="plsm20260001")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("number", response.data)
        self.assertEqual(Invoice.objects.count(), 1)
        # The refused try did not use up a counter value either.
        self.assertEqual(InvoiceNumberSequence.objects.get(year=2026).last_number, 1)

    def test_odd_characters_are_refused(self):
        for bad in ("PLSM 2026/15", "../etc/passwd", "<b>1</b>"):
            with self.subTest(number=bad):
                response = self.compose(number=bad)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("number", response.data)
        self.assertFalse(Invoice.objects.exists())

    def test_the_preview_shows_the_typed_number(self):
        response = self.post("staff-invoice-preview", number="PLSM20260014")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["number"], "PLSM20260014")
        # Previewing takes nothing.
        self.assertFalse(InvoiceNumberSequence.objects.exists())

    def test_a_saved_invoice_keeps_its_number_whatever_is_sent(self):
        self.compose()
        invoice = Invoice.objects.get()

        self.edit(invoice, number="PLSM20260099")

        invoice.refresh_from_db()
        self.assertEqual(invoice.reference, "PLSM20260001")

    def test_our_own_format_is_recognised_exactly(self):
        settings_row = InvoiceSettings.load()
        self.assertEqual(settings_row.parse_number(2026, "PLSM20260015"), 15)
        self.assertIsNone(settings_row.parse_number(2026, "PLSM2026015"))  # not padded like ours
        self.assertIsNone(settings_row.parse_number(2026, "PLSM20250015"))  # another year
        self.assertIsNone(settings_row.parse_number(2026, "OLD-77"))


class CounterSettingTests(EditorTestCase):
    """The settings page: an admin sets the number the next invoice gets."""

    URL = "staff-invoice-settings"

    def today(self):
        return timezone.localdate().isoformat()

    def test_the_settings_show_the_counter(self):
        InvoiceNumberSequence.objects.create(year=timezone.localdate().year, last_number=14)

        data = self.client.get(reverse(self.URL)).data["settings"]

        self.assertEqual(data["next_sequence"], 15)
        self.assertTrue(data["next_number"].endswith("0015"))

    def test_an_admin_sets_where_the_next_invoice_starts(self):
        self.client.force_authenticate(self.admin)

        response = self.client.put(reverse(self.URL), {"next_sequence": 15}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["settings"]["next_sequence"], 15)
        self.compose(user=self.staff, invoice_date=self.today())
        self.assertTrue(Invoice.objects.get().reference.endswith("0015"))

    def test_an_office_worker_cannot_change_it(self):
        response = self.client.put(reverse(self.URL), {"next_sequence": 500}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(InvoiceNumberSequence.objects.exists())

    def test_saving_other_settings_does_not_touch_the_counter(self):
        InvoiceNumberSequence.objects.create(year=timezone.localdate().year, last_number=14)
        self.client.force_authenticate(self.admin)

        # The page sends the whole form back, counter included, unchanged.
        self.client.put(reverse(self.URL), {"standard_vat_rate": "9", "next_sequence": 15}, format="json")

        self.assertEqual(InvoiceNumberSequence.objects.get().last_number, 14)

    def test_a_number_below_one_is_refused(self):
        self.client.force_authenticate(self.admin)
        for bad in (0, -3, "abc"):
            with self.subTest(value=bad):
                response = self.client.put(reverse(self.URL), {"next_sequence": bad}, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_going_back_never_reuses_an_issued_number(self):
        year = timezone.localdate().year
        self.compose(invoice_date=self.today())  # takes ...0001
        self.client.force_authenticate(self.admin)

        self.client.put(reverse(self.URL), {"next_sequence": 1}, format="json")
        self.compose(user=self.staff, customer=self.mary.pk, package=self.marys.pk, invoice_date=self.today())

        numbers = sorted(Invoice.objects.values_list("reference", flat=True))
        self.assertEqual(numbers, [f"PLSM{year}0001", f"PLSM{year}0002"])

    def test_the_change_is_written_to_the_log(self):
        self.client.force_authenticate(self.admin)
        with self.assertLogs("staff.invoice_config", level="INFO") as logged:
            self.client.put(reverse(self.URL), {"next_sequence": 40}, format="json")
        self.assertIn("changed from 1 to 40", logged.output[0])
