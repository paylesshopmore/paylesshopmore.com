"""Tests for the warehouse sign-in added for /warehouse/login, and for running
the floor's accounts from the manager's side.

  * Generated PINs: shown once, stored hashed, the old PIN dead at once, and
    the worker forced - by the server, not just the app - to choose their own.
  * E-mail + PIN sign-in on a computer that is not a registered floor device:
    one answer for every failure, the same lockout as everywhere else.
  * Signing out is on the record.
  * Switching an account off ends its sessions immediately.
  * Who may do each of these: a worker may do none; a manager only for
    warehouse workers; an admin for everyone but themselves.
"""

from django.contrib.auth.hashers import check_password
from django.urls import reverse
from rest_framework import status

from . import floor
from .models import FloorEvent, User, WarehousePin
from .test_floor import PASSWORD, PIN, FloorTestCase, make_account

LOGIN_URL = reverse("warehouse-login")
PROFILE_URL = reverse("profile")
PIN_URL = reverse("pin")
LOGOUT_URL = reverse("logout")
# Any warehouse endpoint will do: the intake sheets are the floor's own.
WAREHOUSE_URL = reverse("staff-intake-list")


def issue_url(user):
    return reverse("staff-worker-issue-pin", args=[user.pk])


def active_url(user):
    return reverse("staff-customer-active", args=[user.pk])


class WarehouseLoginTestCase(FloorTestCase):
    def setUp(self):
        super().setUp()
        self.manager = make_account("chef@example.com", User.Role.MANAGER, "Mila", "Chef")

    def sign_in_as(self, user):
        self.client.logout()
        self.client.post(
            reverse("login"), {"username": user.email, "password": PASSWORD}, format="json"
        )

    def email_login(self, email="wim@example.com", pin=PIN):
        return self.client.post(LOGIN_URL, {"email": email, "pin": pin}, format="json")


class EmailPinLoginTests(WarehouseLoginTestCase):
    def test_e_mail_and_pin_sign_in_without_a_registered_device(self):
        response = self.email_login()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get(WAREHOUSE_URL).status_code, 200)
        profile = self.client.get(PROFILE_URL).data
        self.assertEqual(profile["session_idle_seconds"], 30 * 60)

    def test_the_address_is_matched_whatever_its_case(self):
        self.assertEqual(self.email_login(email="WIM@Example.com").status_code, 200)

    def test_it_is_on_the_record(self):
        self.email_login()
        self.assertTrue(
            FloorEvent.objects.filter(
                kind=FloorEvent.Kind.EMAIL_PIN_SIGN_IN, user=self.worker
            ).exists()
        )

    def test_one_answer_for_every_way_it_can_be_wrong(self):
        answers = {
            "wrong pin": self.email_login(pin="9371"),
            "unknown address": self.email_login(email="nobody@example.com"),
            "customer": self.email_login(email="klant@example.com"),
            "office": self.email_login(email="kantoor@example.com"),
            "manager": self.email_login(email="chef@example.com"),
            "no pin set": self.email_login(email="ana@example.com"),
            "not four digits": self.email_login(pin="12345"),
        }
        for why, response in answers.items():
            with self.subTest(why):
                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
                self.assertEqual(response.data["detail"], "That e-mail address or PIN is not right.")

    def test_five_wrong_lock_the_pin_like_everywhere_else(self):
        for _ in range(floor.MAX_PIN_ATTEMPTS):
            self.email_login(pin="9371")

        self.assertEqual(self.email_login().status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIsNotNone(self.pin_row().locked_at)
        self.assertTrue(
            FloorEvent.objects.filter(kind=FloorEvent.Kind.WRONG_PIN, user=self.worker).exists()
        )

    def test_a_switched_off_account_cannot_sign_in(self):
        self.worker.is_active = False
        self.worker.save()
        self.assertEqual(self.email_login().status_code, status.HTTP_401_UNAUTHORIZED)


class SwitchingWorkersTests(WarehouseLoginTestCase):
    """A shared tablet: one worker after another, on one browser."""

    def test_the_next_worker_gets_a_fresh_session_not_the_last_ones(self):
        from django.contrib.sessions.models import Session

        floor.set_pin(self.other, "8642")
        self.on_device()
        self.assertEqual(self.pin_login().status_code, 200)
        first_key = self.client.cookies["sessionid"].value

        self.assertEqual(self.pin_login(worker=self.other, pin="8642").status_code, 200)
        second_key = self.client.cookies["sessionid"].value

        # A new session for Ana; Wim's is gone, not taken over.
        self.assertNotEqual(first_key, second_key)
        self.assertFalse(Session.objects.filter(session_key=first_key).exists())
        self.assertEqual(self.client.get(PROFILE_URL).data["email"], "ana@example.com")

    def test_the_same_on_a_personal_phone_with_e_mail_and_pin(self):
        floor.set_pin(self.other, "8642")
        self.assertEqual(self.email_login().status_code, 200)
        self.assertEqual(self.email_login("ana@example.com", "8642").status_code, 200)
        self.assertEqual(self.client.get(PROFILE_URL).data["email"], "ana@example.com")


class IssuedPinTests(WarehouseLoginTestCase):
    def test_a_manager_gets_a_new_pin_once_and_only_its_hash_is_kept(self):
        self.sign_in_as(self.manager)

        response = self.client.post(issue_url(self.other))

        self.assertEqual(response.status_code, 200)
        pin = response.data["pin"]
        self.assertRegex(pin, r"^\d{4}$")
        self.assertIsNone(floor.weak_pin_reason(pin))
        self.assertEqual(response["Cache-Control"], "no-store")
        row = self.pin_row(self.other)
        self.assertNotEqual(row.pin_hash, pin)
        self.assertTrue(check_password(pin, row.pin_hash))
        self.assertTrue(row.must_change)
        self.assertTrue(
            FloorEvent.objects.filter(
                kind=FloorEvent.Kind.PIN_ISSUED, user=self.other, actor=self.manager
            ).exists()
        )

    def test_the_old_pin_stops_working_and_a_lock_is_cleared(self):
        WarehousePin.objects.filter(user=self.worker).update(locked_at="2026-01-01T00:00Z")
        self.sign_in_as(self.manager)
        new_pin = self.client.post(issue_url(self.worker)).data["pin"]
        self.client.logout()

        self.assertEqual(self.email_login(pin=PIN).status_code, 401)
        self.assertEqual(self.email_login(pin=new_pin).status_code, 200)

    def test_the_workers_list_never_shows_a_pin(self):
        self.sign_in_as(self.manager)
        pin = self.client.post(issue_url(self.worker)).data["pin"]

        rows = self.client.get(reverse("staff-customer-list")).content.decode()

        self.assertNotIn(pin, rows)
        self.assertIn('"pin_status":"issued"', rows.replace(" ", ""))

    def test_a_generated_pin_opens_nothing_until_the_worker_chooses_their_own(self):
        self.sign_in_as(self.manager)
        pin = self.client.post(issue_url(self.worker)).data["pin"]
        self.client.logout()
        self.email_login(pin=pin)

        profile = self.client.get(PROFILE_URL).data
        self.assertTrue(profile["pin_must_change"])
        self.assertTrue(profile["can_set_pin"])
        refused = self.client.get(WAREHOUSE_URL)
        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(refused.data["detail"], "Choose your own PIN first.")

        # Not the one they were given.
        same = self.client.post(PIN_URL, {"pin": pin}, format="json")
        self.assertEqual(same.status_code, status.HTTP_400_BAD_REQUEST)

        chosen = "5937" if pin != "5937" else "6048"
        self.assertEqual(self.client.post(PIN_URL, {"pin": chosen}, format="json").status_code, 204)
        self.assertEqual(self.client.get(WAREHOUSE_URL).status_code, 200)
        self.assertFalse(self.client.get(PROFILE_URL).data["pin_must_change"])

    def test_the_same_holds_on_a_registered_device(self):
        self.sign_in_as(self.manager)
        pin = self.client.post(issue_url(self.worker)).data["pin"]
        self.client.logout()
        self.on_device()

        self.assertEqual(self.pin_login(pin=pin).status_code, 200)
        self.assertEqual(self.client.get(WAREHOUSE_URL).status_code, 403)
        self.assertTrue(self.client.get(PROFILE_URL).data["can_set_pin"])

    def test_only_warehouse_workers_get_a_pin(self):
        self.sign_in_as(self.admin)
        for target in (self.office, self.customer, self.manager):
            with self.subTest(target.email):
                self.assertEqual(self.client.post(issue_url(target)).status_code, 400)

    def test_a_worker_and_the_office_cannot_generate_pins(self):
        self.email_login()
        self.assertEqual(self.client.post(issue_url(self.other)).status_code, 403)

        # Office staff who are not admins do not run the floor.
        self.sign_in_as(self.office)
        self.assertEqual(self.client.post(issue_url(self.other)).status_code, 403)

    def test_an_admin_may(self):
        self.sign_in_as(self.admin)
        self.assertEqual(self.client.post(issue_url(self.other)).status_code, 200)


class SignOutTests(WarehouseLoginTestCase):
    def test_signing_out_of_the_warehouse_is_on_the_record(self):
        self.email_login()
        self.client.post(LOGOUT_URL)
        self.assertTrue(
            FloorEvent.objects.filter(kind=FloorEvent.Kind.SIGN_OUT, user=self.worker).exists()
        )

    def test_a_customer_signing_out_is_not(self):
        self.sign_in_as(self.customer)
        self.client.post(LOGOUT_URL)
        self.assertFalse(FloorEvent.objects.filter(kind=FloorEvent.Kind.SIGN_OUT).exists())


class SwitchOffTests(WarehouseLoginTestCase):
    def test_a_manager_switches_a_worker_off_and_their_session_ends_at_once(self):
        # The worker is signed in on another computer.
        worker_client = self.client_class()
        worker_client.post(LOGIN_URL, {"email": "wim@example.com", "pin": PIN}, format="json")
        self.assertEqual(worker_client.get(WAREHOUSE_URL).status_code, 200)

        self.sign_in_as(self.manager)
        response = self.client.post(active_url(self.worker), {"active": False}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_active"])
        self.assertIn(worker_client.get(WAREHOUSE_URL).status_code, (401, 403))
        self.assertTrue(
            FloorEvent.objects.filter(
                kind=FloorEvent.Kind.ACCOUNT_DEACTIVATED, user=self.worker, actor=self.manager
            ).exists()
        )

    def test_and_on_again(self):
        self.worker.is_active = False
        self.worker.save()
        self.sign_in_as(self.manager)

        response = self.client.post(active_url(self.worker), {"active": True}, format="json")

        self.assertTrue(response.data["is_active"])
        self.client.logout()
        self.assertEqual(self.email_login().status_code, 200)

    def test_a_manager_cannot_touch_anybody_but_warehouse_workers(self):
        self.sign_in_as(self.manager)
        other_manager = make_account("chef2@example.com", User.Role.MANAGER, "Max", "Chef")
        for target in (self.admin, self.office, self.customer, other_manager):
            with self.subTest(target.email):
                response = self.client.post(active_url(target), {"active": False}, format="json")
                self.assertEqual(response.status_code, 404)
                target.refresh_from_db()
                self.assertTrue(target.is_active)

    def test_nobody_switches_themselves_off(self):
        self.sign_in_as(self.admin)
        response = self.client.post(active_url(self.admin), {"active": False}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_office_staff_who_are_not_admins_may_not(self):
        self.sign_in_as(self.office)
        response = self.client.post(active_url(self.worker), {"active": False}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_a_worker_may_not(self):
        self.email_login()
        response = self.client.post(active_url(self.other), {"active": False}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_only_true_or_false(self):
        self.sign_in_as(self.admin)
        response = self.client.post(active_url(self.worker), {"active": "no"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_the_workers_list_shows_the_last_sign_in(self):
        self.email_login()
        self.sign_in_as(self.manager)
        rows = self.client.get(reverse("staff-customer-list")).data
        rows = rows["results"] if isinstance(rows, dict) else rows
        wim = next(row for row in rows if row["id"] == self.worker.pk)
        self.assertIsNotNone(wim["last_login"])
