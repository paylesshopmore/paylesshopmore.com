"""Tests for the warehouse intake sheet.

Three things are worth proving, and they are the three things somebody would
be relying on without knowing it:

* A customer cannot see any of this. The sheet says who packed badly and what
  was damaged, and it is written on the assumption that only staff read it.
* A sheet cannot be handed over half-finished, and cannot be handed over
  twice. The first would send the office a form with the damage box empty; the
  second would have two people start the same job.
* The release actually mails the other staff, at their work addresses, and not
  the person who pressed the button.
"""

from datetime import date

from django.contrib.auth import get_user_model
from django.core import mail
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from accounts.models import Package
from bookings.models import Booking
from config.testing import WarehouseAPITestCase

from .messages import body_for
from .models import IntakeSheet, Measurement
from .recipients import handover_recipients
from .serializers import missing_for_release

User = get_user_model()


def complete_sheet_fields():
    """Everything missing_for_release insists on, and nothing else.

    A helper rather than a fixture so each test can leave exactly one thing
    out and say which.
    """
    return {
        "received_on": date(2026, 9, 11),
        "colli_count": 4,
        "freight": IntakeSheet.Freight.SEA,
        "destination": "Curaçao",
        "packaging": IntakeSheet.Packaging.PALLET,
        "packed_well": IntakeSheet.Check.YES,
        "damage_present": IntakeSheet.Check.NO,
        "address_label_present": IntakeSheet.Check.YES,
    }


class IntakeSheetTestCase(WarehouseAPITestCase):
    """Shared fixtures: a customer, two warehouse staff, one draft sheet."""

    def setUp(self):
        self.customer = User.objects.create_user(
            username="klant@example.com",
            email="klant@example.com",
            password="a-long-enough-password",
        )
        self.warehouse = User.objects.create_user(
            username="magazijn@example.com",
            email="magazijn@example.com",
            password="a-long-enough-password",
            first_name="Magazijn",
            last_name="Medewerker",
            is_staff=True,
        )
        self.office = User.objects.create_user(
            username="kantoor@example.com",
            email="kantoor@example.com",
            password="a-long-enough-password",
            first_name="Back",
            last_name="Office",
            is_staff=True,
        )

        self.sheet = IntakeSheet.objects.create(
            reference="CI-1001",
            supplier="Leverancier BV",
            created_by=self.warehouse,
            **complete_sheet_fields(),
        )
        # One measured line, which a sheet needs before it can be released.
        Measurement.objects.create(
            sheet=self.sheet,
            quantity=4,
            length_cm=120,
            width_cm=80,
            height_cm=100,
            weight_kg=50,
        )

        self.list_url = reverse("staff-intake-list")
        self.detail_url = reverse("staff-intake-detail", args=[self.sheet.pk])
        self.release_url = reverse("staff-intake-release", args=[self.sheet.pk])


class AccessTests(IntakeSheetTestCase):
    """Who can reach the sheets at all."""

    def test_anonymous_is_refused(self):
        response = self.client.get(self.list_url)
        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_customer_is_refused(self):
        self.client.force_authenticate(self.customer)

        for url in (self.list_url, self.detail_url):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code, status.HTTP_403_FORBIDDEN
                )

        self.assertEqual(
            self.client.post(self.release_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_staff_can_read_and_write(self):
        self.client.force_authenticate(self.warehouse)

        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.patch(self.detail_url, {"colli_count": 5}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.colli_count, 5)

    def test_the_shipment_number_cannot_be_changed_by_anybody(self):
        # An admin included: the number is fixed once the sheet has it.
        admin = User.objects.create_user(
            username="admin@example.com", email="admin@example.com",
            password="a-long-enough-password", is_staff=True, is_superuser=True, role="admin",
        )
        self.client.force_authenticate(admin)
        response = self.client.patch(self.detail_url, {"reference": "CI-OTHER"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.reference, "CI-1001")
        # Sending the same number back, as every save does, is fine.
        response = self.client.patch(self.detail_url, {"reference": "CI-1001"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_creating_stamps_the_author_and_signs_the_sheet(self):
        """The name at the bottom of the form is whoever is signed in.

        Sent deliberately wrong here. A signature somebody can type over is
        not evidence of who did the intake, so the name in the request is
        discarded rather than refused - there is no version of this request
        where another name is the right answer.
        """
        self.client.force_authenticate(self.warehouse)

        response = self.client.post(
            self.list_url,
            {"reference": "CI-1002", "employee_name": "Iemand Anders"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = IntakeSheet.objects.get(reference="CI-1002")
        self.assertEqual(created.created_by, self.warehouse)
        self.assertEqual(created.employee_name, "Magazijn Medewerker")
        self.assertEqual(created.status, IntakeSheet.Status.DRAFT)

    def test_the_signature_cannot_be_edited_afterwards(self):
        """Not even by the person who signed it, and not on their own sheet."""
        self.client.force_authenticate(self.warehouse)

        response = self.client.patch(
            self.detail_url, {"employee_name": "Iemand Anders"}, format="json"
        )

        # Accepted, because the rest of a PATCH carrying it is ordinary work
        # on the sheet - the name itself is simply not one of the fields a
        # PATCH can reach.
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.sheet.refresh_from_db()
        self.assertNotEqual(self.sheet.employee_name, "Iemand Anders")

    def test_a_sheet_with_something_on_it_cannot_be_deleted(self):
        # Only EMPTY sheets can be deleted (warehouse/intake_numbers.py);
        # this one has a supplier and a measured line. 409, and it stays.
        self.client.force_authenticate(self.warehouse)

        self.assertEqual(
            self.client.delete(self.detail_url).status_code,
            status.HTTP_409_CONFLICT,
        )
        self.assertTrue(IntakeSheet.objects.filter(pk=self.sheet.pk).exists())


class WarehouseRoleTests(IntakeSheetTestCase):
    """The floor reaches the intake sheets, and nothing else.

    The boundary is the feature. A warehouse phone is the likeliest device in
    the company to be left on a bench or picked up by somebody else, and what
    it can reach when that happens is decided here.
    """

    def setUp(self):
        super().setUp()

        self.floor = User.objects.create_user(
            username="vloer@example.com",
            email="vloer@example.com",
            password="a-long-enough-password",
            first_name="Vloer",
            last_name="Medewerker",
            is_warehouse=True,
        )
        # A worker works on the sheets they started themselves.
        self.sheet.created_by = self.floor
        self.sheet.save(update_fields=["created_by"])

    def test_the_floor_can_work_on_intake_sheets(self):
        self.client.force_authenticate(self.floor)

        self.assertEqual(
            self.client.get(self.list_url).status_code, status.HTTP_200_OK
        )

        response = self.client.post(
            self.list_url, {"reference": "CI-2001"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.patch(
            self.detail_url, {"colli_count": 7}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_the_floor_can_release_a_sheet(self):
        self.client.force_authenticate(self.floor)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.release_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_the_floor_cannot_reach_the_rest_of_the_back_office(self):
        """The reason the two flags are separate rather than one."""
        self.client.force_authenticate(self.floor)

        for name in (
            "staff-invoice-list",
            "staff-customer-list",
            "staff-quote-list",
            "staff-package-list",
            "staff-message-list",
            "staff-booking-list",
            "staff-overview",
        ):
            with self.subTest(route=name):
                self.assertEqual(
                    self.client.get(reverse(name)).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_the_floor_is_not_a_django_admin(self):
        """is_warehouse must never become a way into /admin/."""
        self.assertFalse(self.floor.is_staff)

    def test_a_customer_is_still_refused(self):
        """The new permission widens the door, it does not open it."""
        self.client.force_authenticate(self.customer)

        self.assertEqual(
            self.client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_the_floor_is_e_mailed_a_release_like_everybody_else(self):
        self.client.force_authenticate(self.warehouse)

        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(self.release_url)

        self.assertIn("vloer@example.com", mail.outbox[0].to)


class ScanTests(IntakeSheetTestCase):
    """What a code read off a box points at.

    The one behaviour worth being strict about is that scanning writes
    nothing. Everything else here is a lookup order, and the order is a guess
    about what somebody in front of a pallet meant.
    """

    def setUp(self):
        super().setUp()
        self.scan_url = reverse("staff-intake-scan")
        self.client.force_authenticate(self.warehouse)

    def scan(self, code):
        return self.client.get(self.scan_url, {"code": code})

    def test_a_known_reference_opens_the_sheet_that_has_it(self):
        response = self.scan("CI-1001")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["match"], "sheet")
        self.assertEqual(response.data["sheet"]["id"], self.sheet.pk)

    def test_case_does_not_matter(self):
        """A code arrives in whatever case it was printed in."""
        self.assertEqual(self.scan("ci-1001").data["match"], "sheet")

    def test_an_unknown_code_is_an_answer_rather_than_an_error(self):
        response = self.scan("SUPPLIER-99")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["match"], "none")
        self.assertEqual(response.data["code"], "SUPPLIER-99")
        self.assertIsNone(response.data["sheet"])

    def test_scanning_never_writes(self):
        before = IntakeSheet.objects.count()

        self.scan("SUPPLIER-99")
        self.scan("")
        self.scan("CI-1001")

        self.assertEqual(IntakeSheet.objects.count(), before)

    def test_a_tracking_number_finds_the_shipment(self):
        package = Package.objects.create(
            user=self.customer,
            tracking_number="PLS-5000",
            delivery_address_text="Willemstad, Curaçao",
        )

        response = self.scan("PLS-5000")

        self.assertEqual(response.data["match"], "package")
        self.assertEqual(response.data["package"]["id"], package.pk)
        self.assertEqual(response.data["package"]["tracking_number"], "PLS-5000")

    def test_a_shipment_already_written_up_opens_its_sheet_instead(self):
        """Scanning a box twice must not start a second sheet for it."""
        package = Package.objects.create(
            user=self.customer,
            tracking_number="PLS-5001",
            delivery_address_text="Willemstad, Curaçao",
        )
        sheet = IntakeSheet.objects.create(reference="CI-9", package=package)

        response = self.scan("PLS-5001")

        self.assertEqual(response.data["match"], "sheet")
        self.assertEqual(response.data["sheet"]["id"], sheet.pk)

    def test_the_floor_can_scan(self):
        floor = User.objects.create_user(
            username="vloer2@example.com",
            email="vloer2@example.com",
            password="a-long-enough-password",
            is_warehouse=True,
        )
        self.client.force_authenticate(floor)

        self.assertEqual(self.scan("CI-1001").status_code, status.HTTP_200_OK)

    def test_a_customer_cannot_scan(self):
        self.client.force_authenticate(self.customer)

        self.assertEqual(
            self.scan("CI-1001").status_code, status.HTTP_403_FORBIDDEN
        )


class SummaryTests(IntakeSheetTestCase):
    """The counts on the warehouse home screen."""

    def setUp(self):
        super().setUp()

        self.summary_url = reverse("staff-intake-summary")
        self.floor = User.objects.create_user(
            username="vloer3@example.com",
            email="vloer3@example.com",
            password="a-long-enough-password",
            is_warehouse=True,
        )

    def test_counts_drafts_and_the_days_work(self):
        IntakeSheet.objects.create(reference="CI-3001", created_by=self.floor)
        released = IntakeSheet.objects.create(reference="CI-3002")
        released.release(by=self.office)

        self.client.force_authenticate(self.floor)
        response = self.client.get(self.summary_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # The fixture's sheet and CI-3001 are drafts; one of them is theirs.
        self.assertEqual(response.data["drafts"], 2)
        self.assertEqual(response.data["my_drafts"], 1)
        self.assertEqual(response.data["started_today"], 3)
        self.assertEqual(response.data["released_today"], 1)
        self.assertEqual(len(response.data["recent"]), 3)

    def test_counts_what_this_person_released(self):
        mine = IntakeSheet.objects.create(reference="CI-3003")
        mine.release(by=self.floor)
        theirs = IntakeSheet.objects.create(reference="CI-3004")
        theirs.release(by=self.office)

        self.client.force_authenticate(self.floor)
        response = self.client.get(self.summary_url)

        self.assertEqual(response.data["my_released_today"], 1)
        self.assertEqual(response.data["my_released_week"], 1)
        self.assertEqual(response.data["my_released_total"], 1)

    def test_the_list_can_be_narrowed_to_my_own_sheets(self):
        mine = IntakeSheet.objects.create(reference="CI-3005", created_by=self.floor)

        self.client.force_authenticate(self.floor)
        response = self.client.get(self.list_url, {"mine": "true"})

        self.assertEqual([row["id"] for row in response.data["results"]], [mine.pk])

    def test_office_staff_can_read_it_too(self):
        self.client.force_authenticate(self.office)

        self.assertEqual(
            self.client.get(self.summary_url).status_code, status.HTTP_200_OK
        )

    def test_a_customer_cannot(self):
        self.client.force_authenticate(self.customer)

        self.assertEqual(
            self.client.get(self.summary_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )


class MeasurementTests(IntakeSheetTestCase):
    """Measured lines, the totals worked out from them, and the release rule."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.warehouse)

    def patch_lines(self, lines):
        return self.client.patch(
            self.detail_url, {"measurements": lines}, format="json"
        )

    def test_lines_replace_the_old_ones_and_fill_in_the_totals(self):
        response = self.patch_lines(
            [
                # 2 pallets: 2 × 1.2 × 0.8 × 1.5 = 2.88 m3, 2 × 170 = 340 kg
                {"quantity": 2, "packaging": "pallet", "length_cm": "120",
                 "width_cm": "80", "height_cm": "150", "weight_kg": "170"},
                # 1 crate: 0.5 × 0.4 × 0.3 = 0.06 m3, 12.5 kg
                {"quantity": 1, "packaging": "kist", "length_cm": "50",
                 "width_cm": "40", "height_cm": "30", "weight_kg": "12.5"},
            ]
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["measurements"]), 2)

        totals = response.data["totals"]
        self.assertEqual(totals["colli"], 3)
        self.assertEqual(totals["volume_m3"], "2.940")
        self.assertEqual(totals["weight_kg"], "352.50")
        # The sheet goes by sea, where 1 m3 counts as 1000 kg: 2.94 m3 is
        # 2940 kg. More than the scale said, so the volume is what gets billed.
        self.assertEqual(totals["volumetric_weight_kg"], "2940.00")
        self.assertEqual(totals["chargeable_weight_kg"], "2940.00")

        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.measurements.count(), 2)
        self.assertEqual(self.sheet.colli_count, 3)
        self.assertEqual(str(self.sheet.volume_m3), "2.940")

    def test_the_volume_weight_follows_the_sheets_freight(self):
        lines = [
            # 120 x 80 x 50 = 480,000 cm3 = 0.48 m3, 250 kg
            {"quantity": 1, "length_cm": "120", "width_cm": "80",
             "height_cm": "50", "weight_kg": "250"},
        ]

        # By sea, 1 m3 = 1000 kg: 480 kg, more than the 250 on the scale.
        totals = self.patch_lines(lines).data["totals"]
        self.assertEqual(totals["volumetric_weight_kg"], "480.00")
        self.assertEqual(totals["chargeable_weight_kg"], "480.00")

        # By air, 1 m3 = 167 kg: 480,000 / 6000 = 80 kg, so the 250 counts.
        self.sheet.freight = IntakeSheet.Freight.AIR
        self.sheet.save()
        totals = self.patch_lines(lines).data["totals"]
        self.assertEqual(totals["volumetric_weight_kg"], "80.00")
        self.assertEqual(totals["chargeable_weight_kg"], "250.00")

        # No transport chosen: no rule, so no volume weight at all.
        self.sheet.freight = ""
        self.sheet.save()
        totals = self.patch_lines(lines).data["totals"]
        self.assertEqual(totals["volume_m3"], "0.480")
        self.assertIsNone(totals["volumetric_weight_kg"])
        self.assertIsNone(totals["chargeable_weight_kg"])

    def test_a_half_measured_line_is_left_out_of_the_totals(self):
        response = self.patch_lines(
            [{"quantity": 3, "length_cm": "100", "width_cm": "100"}]
        )

        self.assertEqual(response.data["totals"]["colli"], 3)
        self.assertIsNone(response.data["totals"]["volume_m3"])
        self.assertIn("Afmetingen & gewicht", response.data["missing"])

    def test_a_sheet_with_no_complete_line_cannot_be_released(self):
        self.patch_lines([])

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.release_url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Afmetingen & gewicht", response.data["missing"])

    def test_negative_sizes_are_refused(self):
        response = self.patch_lines([{"quantity": 1, "length_cm": "-5"}])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_released_sheet_keeps_its_measurements(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(self.release_url)

        response = self.patch_lines([])

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(self.sheet.measurements.count(), 1)

    def test_the_list_can_be_narrowed_to_measured_sheets(self):
        unmeasured = IntakeSheet.objects.create(created_by=self.warehouse)
        # A second line on the measured sheet, which must not list it twice.
        Measurement.objects.create(sheet=self.sheet, quantity=1)

        measured = self.client.get(self.list_url, {"measured": "true"})
        ids = [row["id"] for row in measured.data["results"]]
        self.assertEqual(ids, [self.sheet.pk])

        not_measured = self.client.get(self.list_url, {"measured": "false"})
        ids = [row["id"] for row in not_measured.data["results"]]
        self.assertEqual(ids, [unmeasured.pk])

    def test_the_email_lists_the_lines_and_the_declared_weight(self):
        owner = User.objects.create_user(
            username="eigenaar@example.com", password="a-long-enough-password"
        )
        self.sheet.package = Package.objects.create(
            user=owner, tracking_number="PLS-7001", weight_kg="180"
        )
        self.sheet.save()
        self.sheet.refresh_from_db()

        body = body_for(self.sheet)

        self.assertIn("4 - 120.0 x 80.0 x 100.0 cm - 50.00 kg each", body)
        self.assertIn("Total: 4 colli, 3.840 m3, 200.00 kg", body)
        self.assertIn("Declared on the shipment: 180.000 kg", body)


class PrefillTests(IntakeSheetTestCase):
    """A sheet started from a scan begins with what the office already knows."""

    def setUp(self):
        super().setUp()

        self.booking = Booking.objects.create(
            shipping_number="CI-7007",
            destination=Booking.Destination.CURACAO,
            freight=Booking.Freight.AIR,
            sender_first_name="Voorbeeld",
            sender_last_name="Klant",
            sender_address="Hoofdstraat 1",
            sender_postal_code="1234 AB",
            sender_city="Amsterdam",
            sender_phone="+31 20 123 4567",
            sender_email="klant@example.com",
            recipient_first_name="Tante",
            recipient_last_name="Ontvanger",
            recipient_address="Schottegatweg 2",
            recipient_city="Willemstad",
            recipient_phone="+599 9 123 4567",
            quantity=3,
            value_eur="250.00",
        )
        self.client.force_authenticate(self.warehouse)

    def test_a_sheet_linked_to_a_booking_starts_filled_in(self):
        response = self.client.post(
            self.list_url,
            {"reference": "CI-7007", "booking": self.booking.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        created = IntakeSheet.objects.get(pk=response.data["id"])
        self.assertEqual(created.destination, "Curaçao")
        self.assertEqual(created.sender, "Voorbeeld Klant")
        self.assertEqual(created.recipient, "Tante Ontvanger")
        self.assertEqual(created.freight, Booking.Freight.AIR)

    def test_what_the_warehouse_typed_wins(self):
        """The head start is a default, never a rule."""
        response = self.client.post(
            self.list_url,
            {
                "reference": "CI-7007",
                "booking": self.booking.pk,
                "destination": "Bonaire",
            },
            format="json",
        )

        created = IntakeSheet.objects.get(pk=response.data["id"])
        self.assertEqual(created.destination, "Bonaire")

    def test_a_sheet_with_no_link_is_left_blank(self):
        response = self.client.post(
            self.list_url, {"reference": "CI-8008"}, format="json"
        )

        created = IntakeSheet.objects.get(pk=response.data["id"])
        self.assertEqual(created.destination, "")
        self.assertEqual(created.sender, "")


class CompletenessTests(IntakeSheetTestCase):
    """What has to be answered before a sheet may go anywhere."""

    def test_a_finished_sheet_is_missing_nothing(self):
        self.assertEqual(missing_for_release(self.sheet), [])

    def test_an_unchecked_damage_box_is_missing(self):
        """Blank is not "no damage", and must not travel as though it were."""
        self.sheet.damage_present = ""
        self.assertIn("Schade aanwezig?", missing_for_release(self.sheet))

    def test_write_in_packaging_needs_the_words(self):
        self.sheet.packaging = IntakeSheet.Packaging.OTHER
        self.sheet.packaging_other = ""
        self.assertIn("Verpakking (anders)", missing_for_release(self.sheet))

        self.sheet.packaging_other = "Big bag"
        self.assertEqual(missing_for_release(self.sheet), [])

    def test_release_refuses_an_unfinished_sheet_and_names_the_boxes(self):
        self.sheet.colli_count = None
        self.sheet.damage_present = ""
        self.sheet.save()

        self.client.force_authenticate(self.warehouse)
        response = self.client.post(self.release_url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertCountEqual(
            response.data["missing"], ["Aantal colli", "Schade aanwezig?"]
        )

        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.status, IntakeSheet.Status.DRAFT)
        self.assertEqual(mail.outbox, [])


class ReleaseTests(IntakeSheetTestCase):
    """Handing the sheet over, and what lands in whose inbox.

    CELERY_TASK_ALWAYS_EAGER is already on in the test settings - no broker is
    configured - so .delay() runs the task inline. What that does not do is
    fire the on_commit hook that queues it: every test runs inside a
    transaction that is rolled back rather than committed. release() below
    stands in for the commit a real request would make, which is the same
    thing invoicing/tests.py does for an approval.
    """

    def release(self):
        """Press Release, and run what pressing it queued."""
        self.client.force_authenticate(self.warehouse)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.release_url)

        return response

    def test_release_moves_the_sheet_and_records_who_did_it(self):
        response = self.release()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], IntakeSheet.Status.RELEASED)

        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.released_by, self.warehouse)
        self.assertIsNotNone(self.sheet.released_at)

    def test_without_a_date_the_day_of_release_is_used(self):
        """The form no longer asks for "Datum aanname goederen"."""
        IntakeSheet.objects.filter(pk=self.sheet.pk).update(received_on=None)

        response = self.release()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.received_on, timezone.localdate())

    def test_a_date_already_on_the_sheet_is_kept(self):
        self.release()
        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.received_on, date(2026, 9, 11))

    def test_a_new_sheet_is_dated_the_day_it_is_started(self):
        self.client.force_authenticate(self.warehouse)
        response = self.client.post(self.list_url, {"reference": "CI-2002"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["received_on"], timezone.localdate().isoformat())

    def test_release_mails_the_other_staff_at_their_work_addresses(self):
        self.release()

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]

        # The office is told; the customer is not, and neither is the person
        # who pressed the button.
        self.assertEqual(sent.to, ["kantoor@example.com"])
        self.assertNotIn("magazijn@example.com", sent.to)
        self.assertNotIn("klant@example.com", sent.to)

        self.assertIn("CI-1001", sent.subject)
        # The sheet itself, not just a link to it.
        self.assertIn("Aantal colli: 4", sent.body)
        self.assertIn("Zeevracht", sent.body)

    def test_damage_is_said_before_the_detail(self):
        self.sheet.damage_present = IntakeSheet.Check.YES
        self.sheet.save()

        self.release()

        self.assertIn("DAMAGED", mail.outbox[0].body)

    def test_staff_who_opted_out_are_left_alone(self):
        self.office.notify_warehouse = False
        self.office.save()

        response = self.release()

        # The handover still happens - the sheet is on the dashboard either
        # way, and a preference is not a veto on the record.
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(mail.outbox, [])

    def test_releasing_twice_is_refused_and_mails_once(self):
        self.assertEqual(self.release().status_code, status.HTTP_200_OK)
        self.assertEqual(self.release().status_code, status.HTTP_409_CONFLICT)

        self.assertEqual(len(mail.outbox), 1)

    def test_a_released_sheet_can_no_longer_be_edited(self):
        self.release()

        response = self.client.patch(
            self.detail_url, {"colli_count": 99}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.colli_count, 4)


class CorrectionTests(IntakeSheetTestCase):
    """Fixing a sheet that went out wrong.

    The thing worth proving is not that the sheet becomes editable again -
    that is one field - but that a correction cannot go out quietly. Everybody
    who got the first copy has to get the second, and be able to tell which is
    which.
    """

    def setUp(self):
        super().setUp()
        self.reopen_url = reverse("staff-intake-reopen", args=[self.sheet.pk])

    def release(self):
        self.client.force_authenticate(self.warehouse)

        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(self.release_url)

    def reopen(self):
        self.client.force_authenticate(self.warehouse)
        return self.client.post(self.reopen_url)

    def test_a_released_sheet_can_be_reopened_and_edited_again(self):
        self.release()

        response = self.reopen()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], IntakeSheet.Status.DRAFT)

        # The mistake being fixed: four colli written up as one.
        response = self.client.patch(
            self.detail_url, {"colli_count": 1}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.colli_count, 1)

    def test_reopening_sends_nothing_by_itself(self):
        """Picking the sheet back up is not the correction."""
        self.release()
        mail.outbox.clear()

        self.reopen()

        self.assertEqual(mail.outbox, [])

    def test_the_second_release_says_it_is_a_correction(self):
        self.release()
        self.reopen()

        self.client.patch(self.detail_url, {"colli_count": 1}, format="json")
        mail.outbox.clear()

        self.release()

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]

        # Findable as a correction without opening it, and checkable against a
        # printout once opened.
        self.assertIn("CORRECTED", sent.subject)
        self.assertIn("version 2", sent.body)
        self.assertIn("Aantal colli: 1", sent.body)

        # The same people who got the first copy get this one.
        self.assertEqual(sent.to, ["kantoor@example.com"])

    def test_the_version_number_counts_up(self):
        self.release()
        self.reopen()
        self.release()
        self.reopen()

        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.revision, 3)

    def test_a_draft_cannot_be_reopened(self):
        """Nothing to pick back up, and the revision must not creep."""
        response = self.reopen()

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.revision, 1)

    def test_a_customer_cannot_reopen_anything(self):
        self.release()
        self.client.force_authenticate(self.customer)

        self.assertEqual(
            self.client.post(self.reopen_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )


class RecipientTests(IntakeSheetTestCase):
    """Who counts as somebody to tell."""

    def test_only_active_staff_with_an_address(self):
        User.objects.create_user(
            username="vertrokken@example.com",
            email="vertrokken@example.com",
            password="a-long-enough-password",
            is_staff=True,
            is_active=False,
        )
        User.objects.create_user(
            username="geen-adres",
            email="",
            password="a-long-enough-password",
            is_staff=True,
        )

        self.assertEqual(
            handover_recipients(),
            ["kantoor@example.com", "magazijn@example.com"],
        )

    def test_the_releaser_is_left_out(self):
        self.assertEqual(
            handover_recipients(exclude=self.warehouse), ["kantoor@example.com"]
        )

    def test_a_colleague_can_take_themselves_off_the_list(self):
        """The opt-out is reachable from the dashboard, not only the admin.

        End to end on purpose: the flag is written through the ordinary
        profile endpoint, which is what the checkbox on the intake page calls,
        and the thing worth proving is that the two ends meet.
        """
        self.client.force_authenticate(self.office)

        response = self.client.patch(
            reverse("profile"), {"notify_warehouse": False}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["notify_warehouse"])
        self.assertEqual(handover_recipients(), ["magazijn@example.com"])

    def test_the_endpoint_answers_with_the_count(self):
        self.client.force_authenticate(self.warehouse)

        response = self.client.get(reverse("staff-intake-recipients"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["addresses"], ["kantoor@example.com"])


class LabelDataTests(IntakeSheetTestCase):
    """What a scanned shipping label adds: the carrier's own weights, the
    units they came in, the shipment details and the text as read."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.warehouse)

    def patch(self, data):
        return self.client.patch(self.detail_url, data, format="json")

    def test_a_line_keeps_the_labels_weights_and_units(self):
        response = self.patch(
            {
                "measurements": [
                    {"quantity": 1, "length_cm": "60", "width_cm": "40", "height_cm": "20",
                     "weight_kg": "13.4", "volumetric_weight_kg": "9.6",
                     "chargeable_weight_kg": "13.4", "weight_unit": "g", "dimension_unit": "mm"},
                ]
            }
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        line = self.sheet.measurements.get()
        self.assertEqual(str(line.volumetric_weight_kg), "9.60")
        self.assertEqual(line.weight_unit, "g")
        self.assertEqual(line.dimension_unit, "mm")
        totals = response.data["totals"]
        # 60 x 40 x 20 / 1,000,000 = 0.048 m3.
        self.assertEqual(totals["volume_m3"], "0.048")
        # The label's own figures win over the worked-out ones.
        self.assertEqual(totals["volumetric_weight_kg"], "9.60")
        self.assertEqual(totals["chargeable_weight_kg"], "13.40")

    def test_a_negative_weight_or_an_unknown_unit_is_refused(self):
        response = self.patch(
            {"measurements": [{"quantity": 1, "volumetric_weight_kg": "-1"}]}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.patch({"measurements": [{"quantity": 1, "weight_unit": "lb"}]})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_shipment_details_take_known_keys_only(self):
        response = self.patch(
            {"shipment_details": {"tracking_number": " 8796 3229 7750 ", "ship_date": "03NOV26", "po": ""}}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.patch(
            {"shipment_details": {"tracking_number": " 8796 3229 7750 ", "purchase_order": ""}}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.shipment_details, {"tracking_number": "8796 3229 7750"})

    def test_the_label_text_is_kept_as_read(self):
        scan = {"lines": ["ACTWGT: 13.40 KG", "C MELODIE"], "source": "device",
                "read_at": "2026-11-05T10:00:00Z"}
        response = self.patch({"label_scans": [scan]})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.sheet.refresh_from_db()
        self.assertEqual(self.sheet.label_scans, [scan])

        response = self.patch({"label_scans": [{"lines": "not a list"}]})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_sheet_can_be_released_before_the_office_chose_the_freight(self):
        fields = complete_sheet_fields()
        fields["freight"] = ""
        for name, value in fields.items():
            setattr(self.sheet, name, value)
        self.sheet.save()
        Measurement.objects.create(
            sheet=self.sheet, length_cm=10, width_cm=10, height_cm=10, weight_kg=1
        )
        self.assertEqual(missing_for_release(self.sheet), [])
