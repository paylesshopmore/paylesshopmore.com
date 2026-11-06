"""Tests for tying goods to customers (warehouse/customers.py).

The rules that matter:
  * the lookup finds existing customers by number, e-mail, reference or
    name, says how, marks a name match as uncertain, and never writes;
  * a worker sees only what they need: masked e-mail, no phone;
  * assigning never creates an account, and a shipment or booking must
    really belong to the chosen customer;
  * goods without a customer may be identified by anybody on the floor;
    moving goods to a different customer is for managers, with a reason;
  * every assignment is recorded, and cannot be edited or deleted;
  * the queue holds exactly the sheets nobody has identified.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

from accounts.models import Address, Package
from bookings.models import Booking
from config.testing import WarehouseAPITestCase

from .models import ImmutableRecord, IntakeAssignment, IntakeSheet

User = get_user_model()

LOOKUP_URL = reverse("staff-warehouse-customer-lookup")
SHEETS_URL = reverse("staff-intake-list")


def assign_url(sheet):
    return reverse("staff-intake-assign-customer", args=[sheet.pk])


def make_user(email, **extra):
    return User.objects.create_user(
        username=email, email=email, password="a-long-enough-password", **extra
    )


def make_booking(user, number, **extra):
    """A minimal booking. Booking has many required columns; only the ones
    this module reads matter here."""
    fields = {f.name for f in Booking._meta.get_fields()}
    values = {
        "user": user,
        "shipping_number": number,
        "status": Booking.Status.NEW,
    }
    # Fill the rest of the required text columns with something sensible.
    for field in Booking._meta.concrete_fields:
        if field.name in values or field.null or field.has_default() or field.blank:
            continue
        if field.get_internal_type() in ("CharField", "TextField"):
            values[field.name] = "x"
        elif field.get_internal_type() == "EmailField":
            values[field.name] = "x@example.com"
    values.update(extra)
    assert "user" in fields
    return Booking.objects.create(**values)


class CustomersTestCase(WarehouseAPITestCase):
    def setUp(self):
        self.klaas = make_user(
            "klaas.klant@example.com",
            first_name="Klaas",
            last_name="Klant",
            phone_number="0612345678",
        )
        Address.objects.create(
            user=self.klaas, street="Kaya Grandi", house_number="1", city="Willemstad", country="CW",
            is_default=True,
        )
        self.karin = make_user("karin@example.com", first_name="Karin", last_name="Klant")
        self.worker = make_user("wim@example.com", role="warehouse", first_name="Wim")
        self.manager = make_user("chef@example.com", role="manager", first_name="Mila")
        self.office = make_user("kantoor@example.com", role="office", first_name="Olga", last_name="Klant")
        self.package = Package.objects.create(
            user=self.klaas,
            tracking_number="PLS-3001",
            status=Package.Status.PAID,
            warehouse_stage=Package.WarehouseStage.AWAITING_PICKUP,
        )
        self.sheet = IntakeSheet.objects.create(reference="BOX-77", supplier="Bol.com")
        self.client.force_authenticate(self.worker)

    def look(self, q):
        response = self.client.get(LOOKUP_URL, {"q": q})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def assign(self, sheet=None, **body):
        return self.client.post(assign_url(sheet or self.sheet), body, format="json")


class LookupTests(CustomersTestCase):
    def ids(self, q):
        return [row["id"] for row in self.look(q)["results"]]

    def test_by_customer_number_in_any_form(self):
        code = self.klaas.customer_code  # PLSM-C000NN
        number = str(self.klaas.customer_number)
        for q in (code, code.lower(), f"C{number}", number):
            with self.subTest(q):
                self.assertIn(self.klaas.pk, self.ids(q))

    def test_by_whole_e_mail_address_only(self):
        self.assertEqual(self.ids("KLAAS.KLANT@example.com"), [self.klaas.pk])
        # Part of an address finds nobody: no browsing the customer list.
        self.assertEqual(self.ids("klaas.klant@"), [])

    def test_by_tracking_number_of_a_shipment(self):
        result = self.look("pls-3001")["results"]
        self.assertEqual([row["id"] for row in result], [self.klaas.pk])
        self.assertEqual(result[0]["matched_by"], ["tracking_number"])
        self.assertTrue(result[0]["exact"])

    def test_by_booking_shipping_number(self):
        make_booking(self.karin, "PLSM-00042")
        self.assertEqual(self.ids("PLSM-00042"), [self.karin.pk])

    def test_by_name_is_marked_uncertain_and_lists_everybody_it_could_be(self):
        result = self.look("klant")["results"]
        # Both customers named Klant; the office worker named Klant is not a
        # customer and is not offered.
        self.assertEqual({row["id"] for row in result}, {self.klaas.pk, self.karin.pk})
        self.assertTrue(all(row["exact"] is False for row in result))
        self.assertTrue(all(row["matched_by"] == ["name"] for row in result))

    def test_every_word_of_a_name_must_match(self):
        self.assertEqual(self.ids("klaas klant"), [self.klaas.pk])

    def test_shows_what_is_needed_and_no_more(self):
        row = self.look("PLS-3001")["results"][0]
        self.assertEqual(row["name"], "Klaas Klant")
        self.assertEqual(row["email"], "k***@example.com")
        self.assertEqual(row["city"], "Willemstad")
        self.assertEqual([s["tracking_number"] for s in row["open_shipments"]], ["PLS-3001"])
        text = str(row)
        self.assertNotIn("0612345678", text)
        self.assertNotIn("klaas.klant@", text)
        self.assertNotIn("Kaya Grandi", text)

    def test_switched_off_and_erased_customers_are_not_offered(self):
        self.karin.is_active = False
        self.karin.save()
        self.assertEqual(self.ids("klant"), [self.klaas.pk])

    def test_too_short_is_refused(self):
        self.assertEqual(self.client.get(LOOKUP_URL, {"q": "k"}).status_code, 400)

    def test_it_writes_nothing(self):
        before = (User.objects.count(), IntakeAssignment.objects.count())
        self.look("klant")
        self.look("PLS-3001")
        self.assertEqual((User.objects.count(), IntakeAssignment.objects.count()), before)
        self.sheet.refresh_from_db()
        self.assertIsNone(self.sheet.customer_id)

    def test_customers_cannot_look_anybody_up(self):
        self.client.force_authenticate(self.klaas)
        self.assertEqual(self.client.get(LOOKUP_URL, {"q": "klant"}).status_code, 403)


class AssignTests(CustomersTestCase):
    def test_a_worker_identifies_goods_without_a_customer(self):
        response = self.assign(customer=self.klaas.pk, matched_by="Name on the box")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["customer"]["id"], self.klaas.pk)
        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.customer, self.klaas)
        # The recipient box is filled in from the customer when empty.
        self.assertEqual(self.sheet.recipient, "Klaas Klant")
        record = IntakeAssignment.objects.get()
        self.assertEqual(record.kind, "customer_assigned")
        self.assertIsNone(record.from_customer)
        self.assertEqual(record.to_customer, self.klaas)
        self.assertEqual(record.user, self.worker)
        self.assertEqual(record.matched_by, "Name on the box")

    def test_with_one_of_their_open_shipments(self):
        response = self.assign(customer=self.klaas.pk, package=self.package.pk)
        self.assertEqual(response.status_code, 200)
        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.package, self.package)

    def test_never_with_somebody_elses_shipment_or_booking(self):
        karins = make_booking(self.karin, "PLSM-00042")
        for body in (
            {"customer": self.karin.pk, "package": self.package.pk},
            {"customer": self.klaas.pk, "booking": karins.pk},
        ):
            with self.subTest(body):
                self.assertEqual(self.assign(**body).status_code, 400)
        self.sheet.refresh_from_db()
        self.assertIsNone(self.sheet.customer_id)

    def test_never_a_new_or_non_customer_account(self):
        users = User.objects.count()
        for customer in (999999, "new", None, self.office.pk, self.worker.pk):
            with self.subTest(customer):
                self.assertEqual(self.assign(customer=customer).status_code, 400)
        self.assertEqual(User.objects.count(), users)
        self.assertFalse(IntakeAssignment.objects.exists())

    def test_a_worker_cannot_move_goods_to_another_customer(self):
        self.assign(customer=self.klaas.pk)

        response = self.assign(customer=self.karin.pk, reason="Wrong one")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.customer, self.klaas)

    def test_a_manager_can_with_a_reason_and_it_is_recorded(self):
        self.assign(customer=self.klaas.pk, package=self.package.pk)
        self.client.force_authenticate(self.manager)

        self.assertEqual(self.assign(customer=self.karin.pk).status_code, 400)  # no reason
        response = self.assign(customer=self.karin.pk, reason="Klaas's name, Karin's order")

        self.assertEqual(response.status_code, 200)
        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.customer, self.karin)
        # Klaas's shipment is not Karin's: the link goes with the change.
        self.assertIsNone(self.sheet.package)
        change = IntakeAssignment.objects.get(kind="customer_changed")
        self.assertEqual((change.from_customer, change.to_customer), (self.klaas, self.karin))
        self.assertEqual(change.user, self.manager)
        self.assertEqual(change.reason, "Klaas's name, Karin's order")

    def test_the_same_customer_again_changes_and_records_nothing(self):
        self.assign(customer=self.klaas.pk)
        self.assertEqual(self.assign(customer=self.klaas.pk).status_code, 200)
        self.assertEqual(IntakeAssignment.objects.count(), 1)

    def test_a_released_sheet_is_refused(self):
        IntakeSheet.objects.filter(pk=self.sheet.pk).update(status=IntakeSheet.Status.RELEASED)
        self.assertEqual(self.assign(customer=self.klaas.pk).status_code, status.HTTP_409_CONFLICT)

    def test_the_record_cannot_be_changed_or_deleted(self):
        self.assign(customer=self.klaas.pk)
        record = IntakeAssignment.objects.get()
        record.reason = "edited"
        with self.assertRaises(ImmutableRecord):
            record.save()
        with self.assertRaises(ImmutableRecord):
            record.delete()
        with self.assertRaises(ImmutableRecord):
            IntakeAssignment.objects.all().delete()

    def test_a_form_save_cannot_move_the_goods_to_another_customers_shipment(self):
        self.assign(customer=self.karin.pk)
        response = self.client.patch(
            reverse("staff-intake-detail", args=[self.sheet.pk]),
            {"package": self.package.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.sheet.refresh_from_db()
        self.assertIsNone(self.sheet.package)

    def test_it_shows_in_the_managers_activity_log(self):
        self.assign(customer=self.klaas.pk, matched_by="Customer number")
        self.client.force_authenticate(self.manager)

        rows = self.client.get(
            reverse("staff-warehouse-manager-activity"), {"tracking": "BOX-77"}
        ).data["results"]

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["action"], "customer_assigned")
        self.assertEqual(rows[0]["worker"]["id"], self.worker.pk)
        self.assertEqual(rows[0]["changes"], {"from_customer": None, "to_customer": "Klaas Klant"})
        self.assertEqual(rows[0]["sheet"]["reference"], "BOX-77")


class QueueTests(CustomersTestCase):
    def queue(self):
        response = self.client.get(SHEETS_URL, {"unassigned": "true"})
        self.assertEqual(response.status_code, 200)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        return [row["id"] for row in rows]

    def test_holds_exactly_the_sheets_nobody_identified(self):
        known = IntakeSheet.objects.create(reference="PLS-3001", package=self.package)
        self.assertEqual(self.queue(), [self.sheet.pk])
        self.assertNotIn(known.pk, self.queue())

        self.assign(customer=self.klaas.pk)
        self.assertEqual(self.queue(), [])

    def test_a_sheet_started_from_a_known_shipment_has_its_customer_at_once(self):
        response = self.client.post(SHEETS_URL, {"package": self.package.pk}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["customer"]["id"], self.klaas.pk)

    def test_the_manager_overview_counts_the_same_sheets(self):
        IntakeSheet.objects.create(reference="PLS-3001", package=self.package)
        self.client.force_authenticate(self.manager)
        data = self.client.get(reverse("staff-warehouse-manager-stats")).data
        self.assertEqual(data["counts"]["unassigned"], 1)
