"""Tests for the manager's quality review (warehouse/review.py).

  * Releasing is unchanged for the floor, and puts the sheet in the queue.
  * Only managers and admins may approve or send back; the floor gets a 403.
  * Sending back reopens the sheet as a new version, with a required note the
    worker can read; releasing it again puts it back in the queue.
  * Each status a sheet can show, and each quality check.
  * Every verdict is recorded and cannot be changed.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

from accounts.models import Package
from config.testing import WarehouseAPITestCase

from . import review
from .models import ImmutableRecord, IntakeReview, IntakeSheet, Measurement

User = get_user_model()

QUEUE_URL = reverse("staff-warehouse-manager-review")


def make_user(email, **extra):
    return User.objects.create_user(
        username=email, email=email, password="a-long-enough-password", **extra
    )


def decision_url(sheet):
    return reverse("staff-intake-review-decision", args=[sheet.pk])


def release_url(sheet):
    return reverse("staff-intake-release", args=[sheet.pk])


class ReviewTestCase(WarehouseAPITestCase):
    def setUp(self):
        self.klaas = make_user("klaas@example.com", first_name="Klaas", last_name="Klant")
        self.worker = make_user("wim@example.com", role="warehouse", first_name="Wim")
        self.manager = make_user("chef@example.com", role="manager", first_name="Mila", last_name="Chef")
        self.admin = make_user("baas@example.com", role="admin")
        self.office = make_user("kantoor@example.com", role="office")
        self.package = Package.objects.create(
            user=self.klaas,
            tracking_number="PLS-4001",
            status=Package.Status.PAID,
            warehouse_stage=Package.WarehouseStage.RECEIVED,
        )
        self.client.force_authenticate(self.worker)

    def complete_sheet(self, reference="CI-4001", **extra):
        """A sheet with every box the release form asks for."""
        fields = {
            "reference": reference,
            "supplier": "Bol.com",
            "sender": "Bol.com",
            "destination": "Curaçao",
            "recipient": "Klaas Klant",
            "customer": self.klaas,
            "package": self.package,
            "colli_count": 1,
            "packaging": IntakeSheet.Packaging.BOX,
            "packed_well": "yes",
            "damage_present": "no",
            "address_label_present": "yes",
        }
        fields.update(extra)
        sheet = IntakeSheet.objects.create(**fields)
        Measurement.objects.create(
            sheet=sheet,
            quantity=1,
            length_cm=Decimal("60"),
            width_cm=Decimal("40"),
            height_cm=Decimal("30"),
            weight_kg=Decimal("12"),
        )
        return sheet

    def released_sheet(self, **extra):
        sheet = self.complete_sheet(**extra)
        response = self.client.post(release_url(sheet))
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        sheet.refresh_from_db()
        return sheet

    def decide(self, sheet, decision, note="", who=None):
        self.client.force_authenticate(who or self.manager)
        return self.client.post(decision_url(sheet), {"decision": decision, "note": note}, format="json")


class FlowTests(ReviewTestCase):
    def test_releasing_puts_the_sheet_in_the_queue_and_the_floor_is_not_held_up(self):
        sheet = self.released_sheet()
        self.assertTrue(sheet.released)
        self.assertEqual(sheet.review_status, "awaiting_review")
        self.client.force_authenticate(self.manager)
        rows = self.client.get(QUEUE_URL).data["results"]
        self.assertEqual([row["id"] for row in rows], [sheet.pk])
        self.assertEqual(rows[0]["quality_status"], "awaiting_review")

    def test_a_manager_approves(self):
        sheet = self.released_sheet()
        response = self.decide(sheet, "approve")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["quality_status"], "approved")
        self.assertEqual(response.data["reviewed_by_name"], "Mila Chef")
        verdict = IntakeReview.objects.get()
        self.assertEqual((verdict.decision, verdict.user), ("review_approved", self.manager))
        # Out of the queue.
        self.assertEqual(self.client.get(QUEUE_URL).data["results"], [])

    def test_sending_back_reopens_it_with_the_note_for_the_worker(self):
        sheet = self.released_sheet()
        response = self.decide(sheet, "correction", "Weight looks like grams, check it")

        self.assertEqual(response.status_code, 200, response.data)
        sheet.refresh_from_db()
        self.assertFalse(sheet.released)
        self.assertEqual(sheet.revision, 2)
        self.assertEqual(sheet.review_status, "needs_correction")

        # The worker sees it, with the note, in their list.
        self.client.force_authenticate(self.worker)
        listed = self.client.get(reverse("staff-intake-list"), {"review": "needs_correction"}).data
        listed = listed["results"] if isinstance(listed, dict) else listed
        self.assertEqual([row["id"] for row in listed], [sheet.pk])
        self.assertEqual(listed[0]["quality_status"], "needs_correction")
        self.assertEqual(listed[0]["review_note"], "Weight looks like grams, check it")

        verdict = IntakeReview.objects.get()
        self.assertEqual(verdict.revision, 1)  # the version that was reviewed

    def test_released_again_it_is_back_in_the_queue(self):
        sheet = self.released_sheet()
        self.decide(sheet, "correction", "Fix the weight")
        self.client.force_authenticate(self.worker)
        self.assertEqual(self.client.post(release_url(sheet)).status_code, 200)
        sheet.refresh_from_db()
        self.assertEqual(sheet.review_status, "awaiting_review")

    def test_a_note_is_required_to_send_back(self):
        sheet = self.released_sheet()
        self.assertEqual(self.decide(sheet, "correction", "  ").status_code, 400)
        sheet.refresh_from_db()
        self.assertTrue(sheet.released)

    def test_an_approved_sheet_can_still_be_sent_back(self):
        sheet = self.released_sheet()
        self.decide(sheet, "approve")
        self.assertEqual(self.decide(sheet, "correction", "Found a problem later").status_code, 200)

    def test_twice_is_a_conflict_not_a_second_verdict(self):
        sheet = self.released_sheet()
        self.decide(sheet, "approve")
        self.assertEqual(self.decide(sheet, "approve").status_code, status.HTTP_409_CONFLICT)
        draft = self.complete_sheet(reference="CI-4002")
        self.assertEqual(self.decide(draft, "approve").status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(self.decide(draft, "correction", "x").status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(IntakeReview.objects.count(), 1)

    def test_only_approve_or_correction(self):
        sheet = self.released_sheet()
        self.assertEqual(self.decide(sheet, "delete").status_code, 400)


class AccessTests(ReviewTestCase):
    def test_the_floor_and_the_office_cannot_review(self):
        sheet = self.released_sheet()
        for who in (self.worker, self.office):
            with self.subTest(who.email):
                self.assertEqual(self.decide(sheet, "approve", who=who).status_code, 403)
                self.assertEqual(self.client.get(QUEUE_URL).status_code, 403)
        self.assertFalse(IntakeReview.objects.exists())

    def test_an_admin_can(self):
        sheet = self.released_sheet()
        self.assertEqual(self.decide(sheet, "approve", who=self.admin).status_code, 200)

    def test_a_form_save_cannot_set_the_review(self):
        sheet = self.complete_sheet()
        self.client.patch(
            reverse("staff-intake-detail", args=[sheet.pk]),
            {"review_status": "approved", "review_note": "self-approved"},
            format="json",
        )
        sheet.refresh_from_db()
        self.assertEqual((sheet.review_status, sheet.review_note), ("", ""))

    def test_verdicts_cannot_be_changed_or_deleted(self):
        sheet = self.released_sheet()
        self.decide(sheet, "approve")
        verdict = IntakeReview.objects.get()
        verdict.note = "edited"
        with self.assertRaises(ImmutableRecord):
            verdict.save()
        with self.assertRaises(ImmutableRecord):
            IntakeReview.objects.all().delete()


class StatusTests(ReviewTestCase):
    def test_waiting_then_processing(self):
        blank = IntakeSheet.objects.create(reference="CI-1")
        self.assertEqual(review.quality_status(blank), "waiting")
        measured = self.complete_sheet()
        self.assertEqual(review.quality_status(measured), "processing")

    def test_completed_once_the_shipment_has_left(self):
        sheet = self.released_sheet()
        self.decide(sheet, "approve")
        Package.objects.filter(pk=self.package.pk).update(warehouse_stage=Package.WarehouseStage.SHIPPED)
        sheet = IntakeSheet.objects.select_related("package").get(pk=sheet.pk)
        self.assertEqual(review.quality_status(sheet), "completed")

        rows = self.client.get(QUEUE_URL, {"status": "completed"}).data["results"]
        self.assertEqual([row["id"] for row in rows], [sheet.pk])


class CheckTests(ReviewTestCase):
    def found(self, sheet):
        return review.issues(IntakeSheet.objects.get(pk=sheet.pk))

    def test_a_complete_sheet_has_nothing_to_report(self):
        self.assertEqual(self.found(self.complete_sheet()), [])

    def test_missing_size_weight_supplier_destination_customer(self):
        sheet = IntakeSheet.objects.create(reference="CI-9")
        Measurement.objects.create(sheet=sheet, quantity=1, length_cm=Decimal("10"))
        found = self.found(sheet)
        for code in (
            "missing_dimensions",
            "missing_weight",
            "missing_supplier",
            "missing_destination",
            "no_customer",
            "incomplete",
        ):
            self.assertIn(code, found)

    def test_a_shipment_of_somebody_else_is_flagged(self):
        other = make_user("karin@example.com", first_name="Karin", last_name="Kok")
        sheet = self.complete_sheet(customer=other, recipient="Karin Kok")
        self.assertIn("customer_mismatch", self.found(sheet))

    def test_a_different_name_on_the_goods_is_worth_a_look_but_not_a_problem(self):
        sheet = self.released_sheet(recipient="Maria Rosario")
        self.assertIn("name_differs", self.found(sheet))
        self.client.force_authenticate(self.manager)
        row = self.client.get(QUEUE_URL).data["results"][0]
        self.assertIn("name_differs", row["issues"])
        self.assertNotIn("name_differs", row["problems"])

    def test_two_sheets_with_one_number_are_duplicates(self):
        first = self.complete_sheet(reference="CI-7")
        second = self.complete_sheet(reference="ci-7")
        self.assertIn("duplicate", self.found(first))
        self.assertIn("duplicate", self.found(second))

    def test_the_queue_filters_by_check(self):
        clean = self.released_sheet(reference="CI-1")
        odd = self.released_sheet(reference="CI-2", recipient="Somebody Else")
        self.client.force_authenticate(self.manager)
        rows = self.client.get(QUEUE_URL, {"issue": "name_differs"}).data["results"]
        self.assertEqual([row["id"] for row in rows], [odd.pk])
        self.assertNotIn(clean.pk, [row["id"] for row in rows])

    def test_the_verdict_keeps_what_the_checks_found(self):
        sheet = self.released_sheet(recipient="Somebody Else")
        self.decide(sheet, "correction", "Check the name")
        self.assertEqual(IntakeReview.objects.get().issues, ["name_differs"])

    def test_bad_filters_are_refused(self):
        self.client.force_authenticate(self.manager)
        for params in ({"status": "lost"}, {"issue": "drop"}, {"page": "0"}):
            with self.subTest(params):
                self.assertEqual(self.client.get(QUEUE_URL, params).status_code, 400)


class ManagerViewTests(ReviewTestCase):
    def test_the_overview_counts_them(self):
        waiting = self.released_sheet(reference="CI-1")
        back = self.released_sheet(reference="CI-2")
        self.decide(back, "correction", "Fix it")
        counts = self.client.get(reverse("staff-warehouse-manager-stats")).data["counts"]
        self.assertEqual((counts["awaiting_review"], counts["needs_correction"]), (1, 1))
        self.assertTrue(waiting)

    def test_verdicts_are_in_the_activity_log(self):
        sheet = self.released_sheet(reference="CI-55")
        self.decide(sheet, "correction", "Weight in grams")
        rows = self.client.get(
            reverse("staff-warehouse-manager-activity"), {"action": "review_correction"}
        ).data["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["worker"]["id"], self.manager.pk)
        self.assertEqual(rows[0]["description"], "Weight in grams")
        self.assertEqual(rows[0]["sheet"]["reference"], "CI-55")
