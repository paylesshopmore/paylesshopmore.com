"""Intake numbers (001, 002 ...), deleting empty intakes, archiving, and who
may change which sheet. See warehouse/intake_numbers.py.

Follows the test list in the warehouse spec: a worker creates intake 001 and
002, a manager deletes the empty 002, the next new intake gets 002 again; a
non-empty intake cannot be deleted; two workers at once never share a number.
"""

from unittest import mock

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.urls import reverse
from rest_framework import status

from accounts.models import Package
from config.testing import WarehouseAPITestCase

from . import intake_numbers
from .models import ImmutableRecord, IntakeDeletion, IntakeNumber, IntakeSheet, Measurement

User = get_user_model()

LIST_URL = reverse("staff-intake-list")
STATS_URL = reverse("staff-warehouse-manager-stats")


def make_user(email, **extra):
    return User.objects.create_user(
        username=email, email=email, password="a-long-enough-password", **extra
    )


def detail_url(sheet_id):
    return reverse("staff-intake-detail", args=[sheet_id])


class IntakeNumberTestCase(WarehouseAPITestCase):
    def setUp(self):
        self.worker = make_user("wim@example.com", role="warehouse", first_name="Wim")
        self.other_worker = make_user("wanda@example.com", role="warehouse", first_name="Wanda")
        self.manager = make_user("chef@example.com", role="manager", first_name="Mila")
        self.admin = make_user("baas@example.com", role="admin")
        self.office = make_user("kantoor@example.com", role="office")
        self.client.force_authenticate(self.worker)

    def new_intake(self, who=None):
        """POST a new, empty intake as `who` (the worker by default)."""
        self.client.force_authenticate(who or self.worker)
        response = self.client.post(LIST_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return response.data

    def delete(self, sheet_id, who=None):
        self.client.force_authenticate(who or self.manager)
        return self.client.delete(detail_url(sheet_id))


class NumberingTests(IntakeNumberTestCase):
    def test_new_intakes_count_up_from_001(self):
        first = self.new_intake()
        second = self.new_intake()

        self.assertEqual((first["number"], first["number_display"]), (1, "001"))
        self.assertEqual((second["number"], second["number_display"]), (2, "002"))

    def test_the_number_is_separate_from_the_permanent_id(self):
        # An id taken by a sheet from before, so the two can't line up by luck.
        IntakeSheet.objects.create(number=None)
        sheet = self.new_intake()
        self.assertNotEqual(sheet["id"], sheet["number"])

    def test_a_number_cannot_be_typed_or_changed(self):
        sheet = self.new_intake()
        self.client.patch(detail_url(sheet["id"]), {"number": 99}, format="json")
        self.assertEqual(IntakeSheet.objects.get(pk=sheet["id"]).number, 1)

    def test_an_empty_002_deleted_by_a_manager_is_used_again(self):
        first = self.new_intake()
        second = self.new_intake()
        third = self.new_intake()

        response = self.delete(second["id"])
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        numbers = list(IntakeSheet.objects.order_by("number").values_list("number", flat=True))
        self.assertEqual(numbers, [1, 3])

        again = self.new_intake()
        self.assertEqual(again["number"], 2)
        self.assertNotEqual(again["id"], second["id"])
        numbers = sorted(IntakeSheet.objects.values_list("number", flat=True))
        self.assertEqual(numbers, [1, 2, 3])
        # And after that the count goes on from the top.
        self.assertEqual(self.new_intake()["number"], 4)
        self.assertEqual({first["number"], third["number"]}, {1, 3})

        entry = IntakeNumber.objects.get(number=2)
        self.assertEqual(entry.state, IntakeNumber.State.IN_USE)
        self.assertEqual(entry.times_used, 2)
        self.assertEqual(entry.released_by, self.manager)

    def test_the_lowest_free_number_goes_first(self):
        sheets = [self.new_intake() for _ in range(5)]
        self.delete(sheets[3]["id"])  # 004
        self.delete(sheets[1]["id"])  # 002
        self.assertEqual(self.new_intake()["number"], 2)
        self.assertEqual(self.new_intake()["number"], 4)
        self.assertEqual(self.new_intake()["number"], 6)

    def test_a_number_retired_some_other_way_is_never_reused(self):
        # A sheet removed outside the app (Django admin): its number is not
        # freed, because nobody checked it was empty.
        first = self.new_intake()
        self.new_intake()
        IntakeSheet.objects.get(pk=first["id"]).delete()

        self.assertEqual(self.new_intake()["number"], 3)
        entry = IntakeNumber.objects.get(number=1)
        self.assertEqual(entry.state, IntakeNumber.State.IN_USE)
        self.assertIsNone(entry.sheet)

    def test_many_intakes_never_share_a_number(self):
        numbers = [self.new_intake(who=[self.worker, self.other_worker][i % 2])["number"] for i in range(20)]
        self.assertEqual(numbers, list(range(1, 21)))

    def test_a_lost_race_for_a_number_is_tried_again(self):
        # Two workers at the same moment: the database refuses the second
        # write of a number (IntegrityError). allocate() undoes that attempt
        # and tries again, and the sheet still gets exactly one number.
        sheet = IntakeSheet.objects.create()
        real_take = intake_numbers._take_number
        calls = {"n": 0}

        def lose_the_first_race(target):
            calls["n"] += 1
            if calls["n"] == 1:
                real_take(target)  # half-done work that must be undone
                raise IntegrityError("duplicate key")
            return real_take(target)

        with mock.patch.object(intake_numbers, "_take_number", side_effect=lose_the_first_race):
            number = intake_numbers.allocate(sheet)

        self.assertEqual(number, 1)
        self.assertEqual(calls["n"], 2)
        self.assertEqual(IntakeNumber.objects.count(), 1)

    def test_the_database_refuses_a_number_twice(self):
        IntakeNumber.objects.create(number=1)
        with self.assertRaises(IntegrityError):
            IntakeNumber.objects.create(number=1)

    def test_a_free_number_taken_meanwhile_is_not_taken_twice(self):
        sheet = self.new_intake()
        self.delete(sheet["id"])  # number 1 is free now
        newcomer = IntakeSheet.objects.create()
        # Another worker takes the free number between our look and our write.
        real_filter = IntakeNumber.objects.filter
        stolen = {"done": False}

        def steal_then_filter(*args, **kwargs):
            if not stolen["done"] and "number" in kwargs and "state" in kwargs:
                stolen["done"] = True
                real_filter(number=kwargs["number"]).update(state=IntakeNumber.State.IN_USE)
            return real_filter(*args, **kwargs)

        with mock.patch.object(IntakeNumber.objects, "filter", side_effect=steal_then_filter):
            with self.assertRaises(IntegrityError):
                intake_numbers._take_number(newcomer)


class DeletingTests(IntakeNumberTestCase):
    def test_a_worker_cannot_delete_an_intake(self):
        sheet = self.new_intake()
        response = self.delete(sheet["id"], who=self.worker)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(IntakeSheet.objects.filter(pk=sheet["id"]).exists())

    def test_the_office_cannot_delete_an_intake(self):
        sheet = self.new_intake()
        self.assertEqual(self.delete(sheet["id"], who=self.office).status_code, 403)

    def test_an_admin_can_delete_an_empty_intake(self):
        sheet = self.new_intake()
        self.assertEqual(self.delete(sheet["id"], who=self.admin).status_code, 204)

    def test_the_deletion_is_recorded_and_cannot_be_changed(self):
        sheet = self.new_intake()
        self.delete(sheet["id"])

        record = IntakeDeletion.objects.get()
        self.assertEqual(record.number, 1)
        self.assertEqual(record.sheet_id_was, sheet["id"])
        self.assertEqual(record.created_by, self.worker)
        self.assertEqual(record.deleted_by, self.manager)
        self.assertIsNotNone(record.deleted_at)
        with self.assertRaises(ImmutableRecord):
            record.save()
        with self.assertRaises(ImmutableRecord):
            IntakeDeletion.objects.all().delete()

    def assert_not_deletable(self, sheet_id):
        response = self.delete(sheet_id)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(IntakeSheet.objects.filter(pk=sheet_id).exists())
        self.assertFalse(IntakeDeletion.objects.exists())
        self.assertFalse(IntakeNumber.objects.filter(state=IntakeNumber.State.AVAILABLE).exists())

    def test_an_intake_with_text_on_it_cannot_be_deleted(self):
        sheet = self.new_intake()
        IntakeSheet.objects.filter(pk=sheet["id"]).update(supplier="Bol.com")
        self.assert_not_deletable(sheet["id"])

    def test_an_intake_with_a_measurement_cannot_be_deleted(self):
        sheet = self.new_intake()
        Measurement.objects.create(sheet_id=sheet["id"], quantity=1)
        self.assert_not_deletable(sheet["id"])

    def test_an_intake_with_a_customer_or_shipment_cannot_be_deleted(self):
        customer = make_user("klant@example.com")
        package = Package.objects.create(user=customer, tracking_number="PLS-1")
        first = self.new_intake()
        second = self.new_intake()
        IntakeSheet.objects.filter(pk=first["id"]).update(customer=customer)
        IntakeSheet.objects.filter(pk=second["id"]).update(package=package)
        self.assert_not_deletable(first["id"])
        self.assert_not_deletable(second["id"])

    def test_an_intake_that_was_ever_released_cannot_be_deleted(self):
        sheet = self.new_intake()
        # Released once and reopened: a draft again, but it went out.
        IntakeSheet.objects.filter(pk=sheet["id"]).update(revision=2)
        self.assert_not_deletable(sheet["id"])

    def test_a_label_read_counts_as_information(self):
        sheet = self.new_intake()
        IntakeSheet.objects.filter(pk=sheet["id"]).update(label_scans=[{"lines": ["x"]}])
        self.assert_not_deletable(sheet["id"])

    def test_a_number_from_a_non_empty_intake_is_never_freed(self):
        sheet = self.new_intake()
        IntakeSheet.objects.filter(pk=sheet["id"]).update(notes="Two boxes")
        self.delete(sheet["id"])
        self.assertEqual(self.new_intake()["number"], 2)


class ArchiveTests(IntakeNumberTestCase):
    def test_a_manager_archives_an_intake_with_a_reason(self):
        sheet = self.new_intake()
        IntakeSheet.objects.filter(pk=sheet["id"]).update(supplier="Bol.com")
        self.client.force_authenticate(self.manager)
        url = reverse("staff-intake-archive", args=[sheet["id"]])

        self.assertEqual(self.client.post(url, {}, format="json").status_code, 400)
        response = self.client.post(url, {"reason": "Entered twice"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["archived"])
        # Out of the everyday list; still there with ?archived=true.
        listed = [row["id"] for row in self.client.get(LIST_URL).data["results"]]
        self.assertNotIn(sheet["id"], listed)
        archived = [row["id"] for row in self.client.get(LIST_URL, {"archived": "true"}).data["results"]]
        self.assertEqual(archived, [sheet["id"]])

    def test_an_archived_intake_cannot_be_edited_until_brought_back(self):
        sheet = self.new_intake()
        intake_numbers.archive(IntakeSheet.objects.get(pk=sheet["id"]), self.manager, "Double")
        self.client.force_authenticate(self.worker)
        response = self.client.patch(detail_url(sheet["id"]), {"notes": "x"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

        self.client.force_authenticate(self.manager)
        self.client.post(reverse("staff-intake-unarchive", args=[sheet["id"]]))
        self.client.force_authenticate(self.worker)
        response = self.client.patch(detail_url(sheet["id"]), {"notes": "x"}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_a_worker_cannot_archive(self):
        sheet = self.new_intake()
        url = reverse("staff-intake-archive", args=[sheet["id"]])
        response = self.client.post(url, {"reason": "Mine"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class WhoMayEditTests(IntakeNumberTestCase):
    def test_a_worker_corrects_their_own_draft(self):
        sheet = self.new_intake()
        response = self.client.patch(detail_url(sheet["id"]), {"notes": "Mine"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["permissions"]["edit"])

    def test_a_worker_cannot_change_another_workers_draft(self):
        sheet = self.new_intake(who=self.other_worker)
        self.client.force_authenticate(self.worker)
        response = self.client.patch(detail_url(sheet["id"]), {"notes": "Not mine"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(self.client.get(detail_url(sheet["id"])).data["permissions"]["edit"])

    def test_a_manager_can_correct_any_draft(self):
        sheet = self.new_intake()
        self.client.force_authenticate(self.manager)
        response = self.client.patch(detail_url(sheet["id"]), {"notes": "Fixed"}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_a_sheet_nobody_signed_yet_is_open_to_the_first_worker(self):
        sheet = IntakeSheet.objects.create()  # prepared by the office
        response = self.client.patch(detail_url(sheet.pk), {"notes": "Here"}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_only_an_admin_or_a_manager_reopens_a_released_sheet(self):
        sheet = IntakeSheet.objects.create(status=IntakeSheet.Status.RELEASED, created_by=self.worker)
        url = reverse("staff-intake-reopen", args=[sheet.pk])

        # Not the worker, and not the office.
        for who in (self.worker, self.office):
            self.client.force_authenticate(who)
            self.assertEqual(self.client.post(url).status_code, status.HTTP_403_FORBIDDEN)
            self.assertFalse(self.client.get(detail_url(sheet.pk)).data["permissions"]["reopen"])

        self.client.force_authenticate(self.admin)
        self.assertTrue(self.client.get(detail_url(sheet.pk)).data["permissions"]["reopen"])

        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(url).status_code, 200)

    def test_permissions_tell_the_page_what_to_show(self):
        sheet = self.new_intake()
        self.assertFalse(self.client.get(detail_url(sheet["id"])).data["permissions"]["delete"])
        self.client.force_authenticate(self.manager)
        allowed = self.client.get(detail_url(sheet["id"])).data["permissions"]
        self.assertTrue(allowed["delete"])
        self.assertTrue(allowed["archive"])

    def test_delete_is_offered_only_for_empty_sheets_in_the_list(self):
        empty = self.new_intake()
        filled = self.new_intake()
        IntakeSheet.objects.filter(pk=filled["id"]).update(supplier="Bol.com")
        self.client.force_authenticate(self.manager)

        rows = {row["id"]: row for row in self.client.get(LIST_URL).data["results"]}

        self.assertTrue(rows[empty["id"]]["permissions"]["delete"])
        self.assertFalse(rows[filled["id"]]["permissions"]["delete"])
        self.assertTrue(rows[filled["id"]]["permissions"]["archive"])


class FilterAndStatsTests(IntakeNumberTestCase):
    def test_the_manager_filters(self):
        mine = self.new_intake()
        theirs = self.new_intake(who=self.other_worker)
        IntakeSheet.objects.filter(pk=theirs["id"]).update(notes="Something")
        self.client.force_authenticate(self.manager)

        def ids(**params):
            return [row["id"] for row in self.client.get(LIST_URL, params).data["results"]]

        self.assertEqual(ids(created_by=self.worker.pk), [mine["id"]])
        self.assertEqual(ids(empty="true"), [mine["id"]])
        self.assertEqual(ids(number="002"), [theirs["id"]])
        self.assertEqual(len(ids(created_from="2000-01-01")), 2)
        self.assertEqual(ids(created_to="2000-01-01"), [])
        self.assertEqual(self.client.get(LIST_URL, {"created_from": "yesterday"}).status_code, 400)

    def test_the_overview_counts_intakes(self):
        self.new_intake()
        filled = self.new_intake()
        IntakeSheet.objects.filter(pk=filled["id"]).update(notes="Two boxes")
        self.client.force_authenticate(self.manager)

        counts = self.client.get(STATS_URL).data["counts"]

        self.assertEqual(counts["intakes_today"], 2)
        self.assertEqual(counts["pending_intakes"], 2)
        self.assertEqual(counts["empty_intakes"], 1)
        self.assertEqual(counts["completed_intakes"], 0)

    def test_the_manager_filters_by_customer(self):
        klaas = make_user("klaas@example.com", first_name="Klaas", last_name="Klant")
        mine = self.new_intake()
        self.new_intake()
        IntakeSheet.objects.filter(pk=mine["id"]).update(customer=klaas)
        self.client.force_authenticate(self.manager)

        for q in ("klaas", "KLANT", "klaas@example", klaas.customer_code or "x"):
            rows = self.client.get(LIST_URL, {"customer_q": q}).data["results"]
            if q == "x":
                continue
            self.assertEqual([row["id"] for row in rows], [mine["id"]], q)


class ShipmentNumberReuseTests(IntakeNumberTestCase):
    """The PLSM shipment number of a deleted EMPTY intake comes back too."""

    def test_a_deleted_plsm_number_is_given_to_the_next_new_intake(self):
        first = self.new_intake()
        second = self.new_intake()
        third = self.new_intake()
        self.assertEqual(
            [first["reference"], second["reference"], third["reference"]],
            ["PLSM-00001", "PLSM-00002", "PLSM-00003"],
        )

        self.delete(second["id"])  # PLSM-00002 is free now

        again = self.new_intake()
        self.assertEqual(again["reference"], "PLSM-00002")
        # And after that the counter goes on as before.
        self.assertEqual(self.new_intake()["reference"], "PLSM-00004")

    def test_the_lowest_freed_number_goes_first(self):
        sheets = [self.new_intake() for _ in range(5)]
        self.delete(sheets[3]["id"])  # PLSM-00004
        self.delete(sheets[1]["id"])  # PLSM-00002
        self.assertEqual(self.new_intake()["reference"], "PLSM-00002")
        self.assertEqual(self.new_intake()["reference"], "PLSM-00004")
        self.assertEqual(self.new_intake()["reference"], "PLSM-00006")

    def test_a_number_meanwhile_typed_on_a_booking_is_not_given_twice(self):
        from bookings.models import Booking

        sheet = self.new_intake()
        self.new_intake()
        self.delete(sheet["id"])  # PLSM-00001 freed
        # The office typed PLSM-00001 on a booking in the meantime.
        Booking.objects.create(shipping_number="PLSM-00001")

        self.assertEqual(self.new_intake()["reference"], "PLSM-00003")

    def test_a_number_from_an_intake_that_is_not_empty_never_comes_back(self):
        sheet = self.new_intake()
        self.new_intake()
        IntakeSheet.objects.filter(pk=sheet["id"]).update(notes="Two boxes")
        self.delete(sheet["id"])  # refused: not empty
        self.assertEqual(self.new_intake()["reference"], "PLSM-00003")

    def test_a_sheet_from_a_booking_keeps_the_bookings_number(self):
        from .models import FreedReference

        first = self.new_intake()
        self.delete(first["id"])
        self.assertTrue(FreedReference.objects.filter(reference="PLSM-00001", reused_at__isnull=True).exists())
        # A manager typing a number of their own does not use up the freed one.
        self.client.force_authenticate(self.manager)
        response = self.client.post(LIST_URL, {"reference": "CI-777"}, format="json")
        self.assertEqual(response.data["reference"], "CI-777")
        self.assertEqual(self.new_intake()["reference"], "PLSM-00001")

    def test_only_numbers_in_the_offices_own_format_come_back(self):
        from .models import FreedReference

        for typed in ("PLSM-0546", "PLSM-748383922938928333", "CI-1001"):
            sheet = self.new_intake()
            IntakeSheet.objects.filter(pk=sheet["id"]).update(reference=typed)
            self.delete(sheet["id"])
        self.assertFalse(FreedReference.objects.exists())

    def test_a_huge_number_typed_on_a_booking_does_not_push_intakes_up(self):
        from bookings.models import Booking

        Booking.objects.create(shipping_number="PLSM-748383922938928329")
        Booking.objects.create(shipping_number="PLSM-00001")
        self.assertEqual(self.new_intake()["reference"], "PLSM-00002")
