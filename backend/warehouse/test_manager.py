"""Tests for the warehouse manager's dashboard (warehouse/manager.py).

  * Who may read it: admins and warehouse managers. Not a warehouse worker,
    not office staff who are not admins, not a customer - checked on the
    server, whatever the app shows.
  * What the overview counts, and that each count means what it says.
  * The activity log: both records merged newest first, every filter, the
    before-and-after values, pages, and bad input refused.
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from accounts import floor
from accounts.models import FloorEvent, Package
from config.testing import WarehouseAPITestCase

from . import manager
from .models import IntakeSheet, PackageActivity, PackageDamageReport, PackageMeasurement

User = get_user_model()

STATS_URL = reverse("staff-warehouse-manager-stats")
ACTIVITY_URL = reverse("staff-warehouse-manager-activity")
REPORT_URL = reverse("staff-warehouse-report")


def make_user(email, **extra):
    return User.objects.create_user(
        username=email, email=email, password="a-long-enough-password", **extra
    )


class ManagerTestCase(WarehouseAPITestCase):
    def setUp(self):
        self.customer = make_user("klant@example.com", first_name="Klaas", last_name="Klant")
        self.worker = make_user("wim@example.com", role="warehouse", first_name="Wim", last_name="Tromp")
        self.other = make_user("ana@example.com", role="warehouse", first_name="Ana", last_name="Silva")
        self.manager = make_user("chef@example.com", role="manager", first_name="Mila", last_name="Chef")
        self.admin = make_user("baas@example.com", role="admin", first_name="Bea")
        self.office = make_user("kantoor@example.com", role="office")
        self.client.force_authenticate(self.manager)

    def package(self, number, stage=Package.WarehouseStage.RECEIVED, **extra):
        return Package.objects.create(
            user=self.customer,
            tracking_number=number,
            status=Package.Status.PAID,
            warehouse_stage=stage,
            **extra,
        )

    def activity(self, package, user, action, at=None, **context):
        return PackageActivity.objects.create(
            package=package,
            user=user,
            action=action,
            description=f"{action} on {package.tracking_number}",
            context=context,
            timestamp=at or timezone.now(),
        )


class AccessTests(ManagerTestCase):
    def test_admins_and_managers_may_read_both(self):
        for who in (self.manager, self.admin):
            self.client.force_authenticate(who)
            with self.subTest(who.email):
                self.assertEqual(self.client.get(STATS_URL).status_code, 200)
                self.assertEqual(self.client.get(ACTIVITY_URL).status_code, 200)

    def test_nobody_else_may(self):
        for who in (self.worker, self.office, self.customer):
            self.client.force_authenticate(who)
            with self.subTest(who.email):
                self.assertEqual(self.client.get(STATS_URL).status_code, status.HTTP_403_FORBIDDEN)
                self.assertEqual(self.client.get(ACTIVITY_URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_or_somebody_not_signed_in(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(STATS_URL).status_code, (401, 403))
        self.assertIn(self.client.get(ACTIVITY_URL).status_code, (401, 403))

    def test_a_manager_may_now_read_the_daily_report_and_a_worker_still_may_not(self):
        self.assertEqual(self.client.get(REPORT_URL).status_code, 200)
        self.client.force_authenticate(self.worker)
        self.assertEqual(self.client.get(REPORT_URL).status_code, 403)

    def test_neither_endpoint_writes(self):
        for url in (STATS_URL, ACTIVITY_URL):
            with self.subTest(url):
                self.assertEqual(self.client.post(url, {}).status_code, 405)


class StatsTests(ManagerTestCase):
    def counts(self):
        return self.client.get(STATS_URL).data["counts"]

    def test_active_workers_leave_out_switched_off_accounts_and_other_roles(self):
        self.other.is_active = False
        self.other.save()
        self.assertEqual(self.counts()["active_workers"], 1)

    def test_received_and_processed_today(self):
        today = self.package("PLS-1", received_at=timezone.now())
        self.package("PLS-2", received_at=timezone.now() - timedelta(days=3))
        self.activity(today, self.worker, PackageActivity.Action.PACKAGE_MARKED_READY)
        # Twice for one package is still one package processed.
        self.activity(today, self.worker, PackageActivity.Action.PACKAGE_MARKED_READY)

        counts = self.counts()
        self.assertEqual(counts["received_today"], 1)
        self.assertEqual(counts["processed_today"], 1)

    def test_waiting_is_what_is_in_the_building_and_not_ready(self):
        self.package("PLS-1", Package.WarehouseStage.RECEIVED)
        self.package("PLS-2", Package.WarehouseStage.PACKED)
        self.package("PLS-3", Package.WarehouseStage.READY)
        self.package("PLS-4", Package.WarehouseStage.SHIPPED)
        self.package("PLS-5", Package.WarehouseStage.AWAITING_PICKUP)
        cancelled = self.package("PLS-6", Package.WarehouseStage.RECEIVED)
        Package.objects.filter(pk=cancelled.pk).update(status=Package.Status.CANCELLED)

        self.assertEqual(self.counts()["waiting"], 2)

    def test_missing_measurements_count_and_list(self):
        unmeasured = self.package("PLS-1", Package.WarehouseStage.RECEIVED)
        measured = self.package("PLS-2", Package.WarehouseStage.MEASURED)
        PackageMeasurement.objects.create(
            package=measured,
            worker=self.worker,
            weight_kg=Decimal("2"),
            length_cm=Decimal("10"),
            width_cm=Decimal("10"),
            height_cm=Decimal("10"),
            dimensional_weight_kg=Decimal("0.17"),
        )

        data = self.client.get(STATS_URL).data
        self.assertEqual(data["counts"]["missing_measurements"], 1)
        self.assertEqual(
            [row["id"] for row in data["attention"]["missing_measurements"]], [unmeasured.pk]
        )

    def test_problems_and_open_damage_are_counted_and_listed(self):
        self.package(
            "PLS-1", problem_note="Label torn off", problem_reported_at=timezone.now()
        )
        damaged = self.package("PLS-2")
        PackageDamageReport.objects.create(package=damaged, worker=self.worker, damage_type="dented")

        data = self.client.get(STATS_URL).data
        self.assertEqual(data["counts"]["problems"], 2)
        self.assertEqual(data["attention"]["problems"][0]["note"], "Label torn off")
        self.assertEqual(data["attention"]["damage"][0]["tracking_number"], "PLS-2")

    def test_intake_sheets_without_a_customer_are_unassigned(self):
        IntakeSheet.objects.create(reference="BOX-77", supplier="Bol.com")
        IntakeSheet.objects.create(reference="PLS-9", package=self.package("PLS-9"))

        data = self.client.get(STATS_URL).data
        self.assertEqual(data["counts"]["unassigned"], 1)
        self.assertEqual(data["attention"]["unassigned"][0]["reference"], "BOX-77")

    def test_signed_in_now_counts_live_warehouse_sessions(self):
        floor.set_pin(self.worker, "4826")
        signed_in = self.client_class()
        signed_in.post(
            reverse("warehouse-login"), {"email": "wim@example.com", "pin": "4826"}, format="json"
        )

        data = self.client.get(STATS_URL).data
        self.assertEqual(data["counts"]["signed_in_now"], 1)
        self.assertEqual([person["name"] for person in data["signed_in"]], ["Wim Tromp"])

        signed_in.post(reverse("logout"))
        self.assertEqual(self.client.get(STATS_URL).data["counts"]["signed_in_now"], 0)

    def test_today_per_worker_comes_from_the_daily_report(self):
        package = self.package("PLS-1")
        self.activity(package, self.worker, PackageActivity.Action.MEASUREMENT_COMPLETED)

        today = self.client.get(STATS_URL).data["today"]
        self.assertEqual(today["totals"]["measured"], 1)
        self.assertEqual([row["name"] for row in today["workers"]], ["Wim Tromp"])


class ActivityTests(ManagerTestCase):
    def setUp(self):
        super().setUp()
        now = timezone.now()
        self.box = self.package("PLS-1")
        self.crate = self.package("PLS-2")
        self.scanned = self.activity(
            self.box, self.worker, PackageActivity.Action.PACKAGE_SCANNED, at=now - timedelta(hours=3)
        )
        self.moved = self.activity(
            self.crate,
            self.other,
            PackageActivity.Action.LOCATION_CHANGED,
            at=now - timedelta(hours=1),
            **{"from": "A1", "to": "B4"},
        )
        self.sign_in = FloorEvent.objects.create(kind=FloorEvent.Kind.EMAIL_PIN_SIGN_IN, user=self.worker)
        FloorEvent.objects.filter(pk=self.sign_in.pk).update(created_at=now - timedelta(hours=4))
        self.reset = FloorEvent.objects.create(
            kind=FloorEvent.Kind.PIN_RESET, user=self.other, actor=self.manager
        )
        FloorEvent.objects.filter(pk=self.reset.pk).update(created_at=now - timedelta(hours=2))

    def get(self, **params):
        response = self.client.get(ACTIVITY_URL, params)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def ids(self, **params):
        return [row["id"] for row in self.get(**params)["results"]]

    def test_both_records_merged_newest_first(self):
        self.assertEqual(
            self.ids(),
            [
                f"package-{self.moved.pk}",
                f"floor-{self.reset.pk}",
                f"package-{self.scanned.pk}",
                f"floor-{self.sign_in.pk}",
            ],
        )
        self.assertEqual(self.get()["count"], 4)

    def test_each_row_says_who_what_which_package_and_when(self):
        row = next(r for r in self.get()["results"] if r["id"] == f"package-{self.moved.pk}")
        self.assertEqual(row["worker"], {"id": self.other.pk, "name": "Ana Silva"})
        self.assertEqual(row["action"], "location_changed")
        self.assertEqual(row["action_display"], "Location changed")
        self.assertEqual(row["package"], {"id": self.crate.pk, "tracking_number": "PLS-2"})
        # Before and after.
        self.assertEqual(row["changes"], {"from": "A1", "to": "B4"})
        self.assertIsNotNone(row["at"])

    def test_a_changed_measurement_shows_the_numbers_before_and_after(self):
        def measure(weight, supersedes=None):
            return PackageMeasurement.objects.create(
                package=self.box,
                worker=self.worker,
                weight_kg=Decimal(weight),
                length_cm=Decimal("60"),
                width_cm=Decimal("40"),
                height_cm=Decimal("30"),
                dimensional_weight_kg=Decimal("12"),
                supersedes=supersedes,
            )

        first = measure("12.50")
        second = measure("13.00", supersedes=first)
        changed = self.activity(
            self.box,
            self.other,
            PackageActivity.Action.MEASUREMENT_UPDATED,
            measurement_id=second.pk,
            supersedes_id=first.pk,
        )

        row = next(r for r in self.get()["results"] if r["id"] == f"package-{changed.pk}")
        self.assertEqual(row["changes"]["from_weight_kg"], "12.50")
        self.assertEqual(row["changes"]["to_weight_kg"], "13.00")
        self.assertEqual(row["changes"]["from_length_cm"], row["changes"]["to_length_cm"])

    def test_a_manager_acting_on_a_worker_is_the_doer_and_the_worker_the_subject(self):
        row = next(r for r in self.get()["results"] if r["id"] == f"floor-{self.reset.pk}")
        self.assertEqual(row["worker"]["id"], self.manager.pk)
        self.assertEqual(row["subject"]["id"], self.other.pk)

    def test_filter_by_worker_includes_what_was_done_to_them(self):
        self.assertEqual(
            self.ids(worker=self.other.pk),
            [f"package-{self.moved.pk}", f"floor-{self.reset.pk}"],
        )
        self.assertEqual(
            self.ids(worker=self.worker.pk),
            [f"package-{self.scanned.pk}", f"floor-{self.sign_in.pk}"],
        )

    def test_filter_by_action_from_either_record(self):
        self.assertEqual(self.ids(action="package_scanned"), [f"package-{self.scanned.pk}"])
        self.assertEqual(self.ids(action="pin_reset"), [f"floor-{self.reset.pk}"])

    def test_filter_by_package_leaves_out_sign_ins(self):
        self.assertEqual(self.ids(package=self.box.pk), [f"package-{self.scanned.pk}"])

    def test_filter_by_tracking_number_whatever_its_case(self):
        self.assertEqual(self.ids(tracking="pls-1"), [f"package-{self.scanned.pk}"])
        self.assertEqual(self.ids(tracking="NOPE-404"), [])

    def test_filter_by_date(self):
        old = self.activity(
            self.box,
            self.worker,
            PackageActivity.Action.PACKAGE_RECEIVED,
            at=timezone.now() - timedelta(days=10),
        )
        day = (timezone.localdate() - timedelta(days=10)).isoformat()
        self.assertEqual(self.ids(date_from=day, date_to=day), [f"package-{old.pk}"])
        self.assertNotIn(f"package-{old.pk}", self.ids(date_from=timezone.localdate().isoformat()))

    def test_pages(self):
        PackageActivity.objects.bulk_create(
            PackageActivity(
                package=self.box,
                user=self.worker,
                action=PackageActivity.Action.PACKAGE_SCANNED,
                description="scan",
                timestamp=timezone.now() - timedelta(days=1, seconds=n),
            )
            for n in range(manager.PAGE_SIZE + 5)
        )
        first = self.get()
        second = self.get(page=2)
        self.assertEqual(len(first["results"]), manager.PAGE_SIZE)
        self.assertTrue(first["has_next"])
        self.assertEqual(len(second["results"]), 9)
        self.assertFalse(second["has_next"])
        self.assertFalse({r["id"] for r in first["results"]} & {r["id"] for r in second["results"]})

    def test_bad_filters_are_refused(self):
        for params in (
            {"worker": "abc"},
            {"package": "-1"},
            {"action": "drop_table"},
            {"date_from": "yesterday"},
            {"date_from": "2026-05-02", "date_to": "2026-05-01"},
            {"page": str(manager.MAX_PAGE + 1)},
        ):
            with self.subTest(params):
                self.assertEqual(self.client.get(ACTIVITY_URL, params).status_code, 400)

    def test_options_list_the_people_and_actions(self):
        options = self.get(options=1)["options"]
        names = [person["name"] for person in options["workers"]]
        self.assertIn("Wim Tromp", names)
        self.assertNotIn("Klaas Klant", names)
        values = {action["value"] for action in options["actions"]}
        self.assertTrue({"package_scanned", "pin_reset", "sign_out"} <= values)

    def test_no_pin_or_session_secret_in_the_log(self):
        floor.set_pin(self.worker, "4826")
        self.assertNotIn("4826", str(self.get()))
