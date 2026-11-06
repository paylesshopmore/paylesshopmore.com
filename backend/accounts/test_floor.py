"""Tests for signing in on a shared floor device: tap your name, type your PIN.

A standing four-digit PIN is a weak secret, so most of what is tested here is
what keeps it from being worth guessing: it only works on a device an admin
registered, five wrong tries in a row lock it, a device with too many wrong
PINs is refused, the try is counted before the PIN is compared, and only a
session that began with an e-mailed code can set one.
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from config.testing import ThrottleFreeAPITestCase

from . import floor
from .models import FloorDevice, FloorEvent, WarehousePin
from .signin_codes import IDLE_SESSION_KEY

User = get_user_model()

ROSTER_URL = reverse("floor-roster")
PIN_LOGIN_URL = reverse("pin-login")
PIN_URL = reverse("pin")
PROFILE_URL = reverse("profile")
CODE_LOGIN_URL = reverse("code-login")
DEVICES_URL = reverse("staff-floor-device-list")
EVENTS_URL = reverse("staff-floor-events")
WORKERS_URL = reverse("staff-customer-list")

PASSWORD = "a-long-enough-password"
PIN = "4826"
WRONG_PIN = "9371"


def make_account(email, role, first="Wim", last="Tromp", **extra):
    return User.objects.create_user(
        username=email,
        email=email,
        password=PASSWORD,
        first_name=first,
        last_name=last,
        role=role,
        **extra,
    )


class FloorTestCase(ThrottleFreeAPITestCase):
    def setUp(self):
        super().setUp()
        self.admin = make_account("baas@example.com", User.Role.ADMIN, "Bea", "Baas")
        self.office = make_account("kantoor@example.com", User.Role.OFFICE, "Olga", "Kantoor")
        self.worker = make_account("wim@example.com", User.Role.WAREHOUSE)
        self.other = make_account("ana@example.com", User.Role.WAREHOUSE, "Ana", "Silva")
        self.customer = make_account("klant@example.com", User.Role.CUSTOMER, "Kees", "Klant")
        self.device, self.token = floor.register_device("Scanner 1", self.admin)
        floor.set_pin(self.worker, PIN)

    def on_device(self, token=None):
        self.client.cookies[floor.DEVICE_COOKIE] = token or self.token

    def pin_login(self, worker=None, pin=PIN):
        return self.client.post(
            PIN_LOGIN_URL,
            {"worker": (worker or self.worker).pk, "pin": pin},
            format="json",
        )

    def pin_row(self, user=None):
        return WarehousePin.objects.get(user=user or self.worker)


class RosterTests(FloorTestCase):
    def test_a_registered_device_lists_the_floor_by_first_name_and_initial(self):
        self.on_device()

        response = self.client.get(ROSTER_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["device"], {"name": "Scanner 1"})
        self.assertEqual(
            response.data["workers"],
            [
                {"id": self.other.pk, "name": "Ana S.", "has_pin": False, "locked": False},
                {"id": self.worker.pk, "name": "Wim T.", "has_pin": True, "locked": False},
            ],
        )

    def test_nobody_but_the_floor_is_on_it(self):
        """No office, admin, customer, switched-off, erased or superuser account."""
        make_account("weg@example.com", User.Role.WAREHOUSE, "Weg", is_active=False)
        erased = make_account("gewist@example.com", User.Role.WAREHOUSE, "Gewist")
        User.objects.filter(pk=erased.pk).update(anonymised_at=timezone.now())
        self.on_device()

        names = [row["name"] for row in self.client.get(ROSTER_URL).data["workers"]]

        self.assertEqual(names, ["Ana S.", "Wim T."])

    def test_no_e_mail_addresses_on_it(self):
        self.on_device()

        self.assertNotIn("@", str(self.client.get(ROSTER_URL).data))

    def test_two_people_with_the_same_short_name_can_tell_themselves_apart(self):
        twin = make_account("wim2@example.com", User.Role.WAREHOUSE, "Wim", "Tak")
        self.on_device()

        names = {row["id"]: row["name"] for row in self.client.get(ROSTER_URL).data["workers"]}

        self.assertEqual(names[self.worker.pk], f"Wim T. (#{self.worker.pk})")
        self.assertEqual(names[twin.pk], f"Wim T. (#{twin.pk})")

    def test_it_is_not_shown_to_a_device_nobody_registered(self):
        response = self.client.get(ROSTER_URL)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn("workers", response.data)

    def test_nor_with_a_made_up_token(self):
        self.on_device("not-a-real-token")

        self.assertEqual(self.client.get(ROSTER_URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_nor_on_a_revoked_device(self):
        floor.revoke_device(self.device, self.admin)
        self.on_device()

        self.assertEqual(self.client.get(ROSTER_URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_a_busy_floor_behind_one_address_is_not_throttled_by_it(self):
        """The default anonymous limit is 60 an hour per address; a warehouse
        opens the list at every handover on every device."""
        self.on_device()

        for _ in range(80):
            response = self.client.get(ROSTER_URL)

        self.assertEqual(response.status_code, 200)

    def test_it_keeps_the_device_cookie_fresh(self):
        self.on_device()

        cookie = self.client.get(ROSTER_URL).cookies[floor.DEVICE_COOKIE]

        self.assertEqual(cookie.value, self.token)
        self.assertTrue(cookie["httponly"])
        self.assertEqual(int(cookie["max-age"]), floor.DEVICE_COOKIE_AGE)


class PinLoginTests(FloorTestCase):
    def test_the_right_pin_on_a_registered_device_signs_in(self):
        self.on_device()

        response = self.pin_login()

        self.assertEqual(response.status_code, 200)
        profile = self.client.get(PROFILE_URL).data
        self.assertEqual(profile["email"], "wim@example.com")
        # The same short idle session as a code sign-in.
        self.assertEqual(profile["session_idle_seconds"], 30 * 60)
        # And the PIN cannot be changed from it: see SetPinTests.
        self.assertFalse(profile["can_set_pin"])

    def test_it_is_in_the_audit_trail_with_the_device(self):
        self.on_device()
        self.pin_login()

        event = FloorEvent.objects.get(kind=FloorEvent.Kind.PIN_SIGN_IN)
        self.assertEqual((event.user, event.device), (self.worker, self.device))

    def test_the_right_pin_is_worthless_without_a_registered_device(self):
        response = self.pin_login()

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.pin_row().failed_attempts, 0)
        self.assertEqual(self.client.get(PROFILE_URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_or_on_a_revoked_one(self):
        floor.revoke_device(self.device, self.admin)
        self.on_device()

        self.assertEqual(self.pin_login().status_code, status.HTTP_403_FORBIDDEN)

    def test_one_answer_for_every_way_it_can_be_wrong(self):
        """Wrong PIN, nobody by that id, no PIN set, an office account: the
        same 401 and the same sentence, so the answers say nothing."""
        self.on_device()
        floor.set_pin(self.other, "5937")
        User.objects.filter(pk=self.other.pk).update(role=User.Role.OFFICE, is_staff=True)

        answers = [
            self.pin_login(pin=WRONG_PIN),
            self.client.post(PIN_LOGIN_URL, {"worker": 999999, "pin": PIN}, format="json"),
            self.client.post(PIN_LOGIN_URL, {"worker": "x", "pin": PIN}, format="json"),
            self.pin_login(worker=self.customer),
            self.pin_login(worker=self.other, pin="5937"),
        ]

        for response in answers:
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
            self.assertEqual(
                response.data, {"detail": "Unable to log in with the credentials provided."}
            )

    def test_five_wrong_in_a_row_lock_it_even_against_the_right_one(self):
        self.on_device()

        for _ in range(floor.MAX_PIN_ATTEMPTS):
            self.assertEqual(self.pin_login(pin=WRONG_PIN).status_code, 401)

        self.assertEqual(self.pin_login().status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIsNotNone(self.pin_row().locked_at)
        self.assertTrue(FloorEvent.objects.filter(kind=FloorEvent.Kind.PIN_LOCKED).exists())
        # The list says so, so the worker is told to ask for a code.
        rows = {r["id"]: r for r in self.client.get(ROSTER_URL).data["workers"]}
        self.assertTrue(rows[self.worker.pk]["locked"])

    def test_it_is_five_in_a_row_a_right_one_starts_again(self):
        self.on_device()

        for _ in range(floor.MAX_PIN_ATTEMPTS - 1):
            self.pin_login(pin=WRONG_PIN)
        self.assertEqual(self.pin_login().status_code, 200)
        self.client.post(reverse("logout"))
        self.on_device()
        for _ in range(floor.MAX_PIN_ATTEMPTS - 1):
            self.pin_login(pin=WRONG_PIN)

        self.assertIsNone(self.pin_row().locked_at)
        self.assertEqual(self.pin_login().status_code, 200)

    def test_the_try_is_counted_before_the_pin_is_compared(self):
        """Counted after, fifty requests at once would each read "no wrong tries
        yet" and all be compared."""
        self.on_device()
        seen = []

        def compare(pin, encoded):
            seen.append(self.pin_row().failed_attempts)
            return False

        with patch("accounts.floor.check_password", side_effect=compare):
            self.pin_login(pin=WRONG_PIN)

        self.assertEqual(seen, [1])

    def test_with_no_tries_left_it_is_not_compared_at_all(self):
        self.on_device()
        WarehousePin.objects.filter(user=self.worker).update(
            failed_attempts=floor.MAX_PIN_ATTEMPTS
        )

        with patch("accounts.floor.check_password") as compare:
            response = self.pin_login()

        self.assertEqual(response.status_code, 401)
        compare.assert_not_called()

    def test_a_device_with_too_many_wrong_pins_is_refused_for_a_while(self):
        """Four tries against every name on the list locks nobody; this stops it."""
        self.on_device()
        FloorEvent.objects.bulk_create(
            FloorEvent(kind=FloorEvent.Kind.WRONG_PIN, user=self.other, device=self.device)
            for _ in range(floor.DEVICE_WRONG_PIN_LIMIT)
        )

        response = self.pin_login()

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        # Refused before anything was counted against the worker.
        self.assertEqual(self.pin_row().failed_attempts, 0)

    def test_another_device_is_not_held_up_by_it(self):
        FloorEvent.objects.bulk_create(
            FloorEvent(kind=FloorEvent.Kind.WRONG_PIN, user=self.other, device=self.device)
            for _ in range(floor.DEVICE_WRONG_PIN_LIMIT)
        )
        _, other_token = floor.register_device("Scanner 2", self.admin)
        self.on_device(other_token)

        self.assertEqual(self.pin_login().status_code, 200)

    def test_an_account_moved_off_the_floor_cannot_use_its_old_pin(self):
        User.objects.filter(pk=self.worker.pk).update(role=User.Role.OFFICE, is_staff=True)
        self.on_device()

        self.assertEqual(self.pin_login().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_a_pin_is_never_in_an_answer_or_the_log(self):
        self.on_device()
        with self.assertLogs("accounts.floor", level="WARNING") as logs:
            for _ in range(floor.MAX_PIN_ATTEMPTS):
                self.pin_login(pin=WRONG_PIN)

        signed_in_elsewhere = self.client_class()
        signed_in_elsewhere.cookies[floor.DEVICE_COOKIE] = self.token
        floor.set_pin(self.other, "5937")
        answer = signed_in_elsewhere.post(
            PIN_LOGIN_URL, {"worker": self.other.pk, "pin": "5937"}, format="json"
        )

        for text in [*logs.output, str(answer.data)]:
            self.assertNotIn(WRONG_PIN, text)
            self.assertNotIn("5937", text)
        self.assertNotEqual(self.pin_row().pin_hash, PIN)


class SetPinTests(FloorTestCase):
    def sign_in_with_code(self, user=None):
        user = user or self.other
        with patch("accounts.signin_codes.secrets.randbelow", return_value=4821):
            from .signin_codes import issue_code

            issue_code(user, self.admin)
        return self.client.post(
            CODE_LOGIN_URL, {"email": user.email, "code": "4821"}, format="json"
        )

    def test_an_e_mailed_code_lets_the_worker_set_their_pin_once(self):
        self.sign_in_with_code()
        self.assertTrue(self.client.get(PROFILE_URL).data["can_set_pin"])

        response = self.client.post(PIN_URL, {"pin": "5937"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        profile = self.client.get(PROFILE_URL).data
        self.assertTrue(profile["has_pin"])
        self.assertFalse(profile["can_set_pin"])
        # Once per code.
        self.assertEqual(
            self.client.post(PIN_URL, {"pin": "6048"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.on_device()
        self.client.post(reverse("logout"))
        self.on_device()
        self.assertEqual(self.pin_login(worker=self.other, pin="5937").status_code, 200)

    def test_a_pin_session_cannot_change_the_pin(self):
        """Or whoever watched a colleague type it could change it and keep the account."""
        self.on_device()
        self.pin_login()

        response = self.client.post(PIN_URL, {"pin": "5937"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_nor_can_a_password_session(self):
        self.client.post(
            reverse("login"), {"username": "kantoor@example.com", "password": PASSWORD}
        )

        self.assertEqual(
            self.client.post(PIN_URL, {"pin": "5937"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_the_first_pins_anybody_would_try_are_refused(self):
        self.sign_in_with_code()

        for weak in ["0000", "7777", "1234", "6789", "4321", "0123", "1212", "1122", "123", "12a4"]:
            response = self.client.post(PIN_URL, {"pin": weak}, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, weak)
            self.assertIn("pin", response.data)

        # Still allowed to try again: a refused PIN does not spend the code.
        self.assertEqual(
            self.client.post(PIN_URL, {"pin": "5937"}, format="json").status_code, 204
        )

    def test_a_new_pin_after_a_code_unlocks_a_locked_one(self):
        WarehousePin.objects.filter(user=self.worker).update(
            failed_attempts=floor.MAX_PIN_ATTEMPTS, locked_at=timezone.now()
        )
        self.sign_in_with_code(self.worker)

        self.client.post(PIN_URL, {"pin": "5937"}, format="json")

        row = self.pin_row()
        self.assertIsNone(row.locked_at)
        self.assertEqual(row.failed_attempts, 0)

    def test_a_code_sign_in_on_a_floor_device_is_in_the_audit_trail(self):
        self.on_device()
        self.sign_in_with_code()

        event = FloorEvent.objects.get(kind=FloorEvent.Kind.CODE_SIGN_IN)
        self.assertEqual((event.user, event.device), (self.other, self.device))

    def test_a_customer_has_no_pin_to_have(self):
        self.client.force_authenticate(self.customer)

        self.assertFalse(self.client.get(PROFILE_URL).data["has_pin"])


class AdminTests(FloorTestCase):
    def test_an_admin_registers_the_device_they_are_holding(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(DEVICES_URL, {"name": "Packing table phone"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        cookie = response.cookies[floor.DEVICE_COOKIE]
        self.assertTrue(cookie["httponly"])
        # The token is in the cookie and nowhere else: not in the answer, and
        # only its digest in the database.
        self.assertNotIn(cookie.value, str(response.data))
        device = FloorDevice.objects.get(pk=response.data["id"])
        self.assertNotEqual(device.token_hash, cookie.value)
        self.assertTrue(response.data["is_this_device"])

        # And the device now works, after the admin signs out. (Carried over by
        # hand: the test client drops cookies set on a force_authenticate request.)
        self.client.force_authenticate(None)
        self.on_device(cookie.value)
        self.assertEqual(self.client.get(ROSTER_URL).status_code, 200)

    def test_only_an_admin_may(self):
        for user in [self.office, self.worker, self.customer]:
            self.client.force_authenticate(user)
            self.assertEqual(
                self.client.post(DEVICES_URL, {"name": "Mine"}, format="json").status_code,
                status.HTTP_403_FORBIDDEN,
            )
            self.assertEqual(self.client.get(DEVICES_URL).status_code, 403)
            self.assertEqual(self.client.get(EVENTS_URL).status_code, 403)

    def test_revoking_a_device_stops_it_at_once(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(reverse("staff-floor-device-revoke", args=[self.device.pk]))

        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data["revoked_at"])
        self.client.force_authenticate(None)
        self.on_device()
        self.assertEqual(self.pin_login().status_code, status.HTTP_403_FORBIDDEN)

    def test_an_admin_resets_a_pin(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(reverse("staff-worker-reset-pin", args=[self.worker.pk]))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(WarehousePin.objects.filter(user=self.worker).exists())
        event = FloorEvent.objects.get(kind=FloorEvent.Kind.PIN_RESET)
        self.assertEqual((event.user, event.actor), (self.worker, self.admin))
        # Nothing left to reset.
        again = self.client.post(reverse("staff-worker-reset-pin", args=[self.worker.pk]))
        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)

    def test_only_an_admin_resets_one(self):
        self.client.force_authenticate(self.office)

        response = self.client.post(reverse("staff-worker-reset-pin", args=[self.worker.pk]))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(WarehousePin.objects.filter(user=self.worker).exists())

    def test_the_audit_trail_says_who_signed_in_where(self):
        self.on_device()
        self.pin_login()
        self.client.post(reverse("logout"))
        self.client.force_authenticate(self.admin)

        rows = self.client.get(EVENTS_URL).data

        # Newest first: signing out is on the record too, on the same device.
        signed_out, signed_in = rows[0], rows[1]
        self.assertEqual(signed_out["kind"], "sign_out")
        self.assertEqual(signed_out["device"], "Scanner 1")
        self.assertEqual(signed_in["kind"], "pin_sign_in")
        self.assertEqual(signed_in["device"], "Scanner 1")
        self.assertEqual(signed_in["user"], str(self.worker))
        self.assertNotIn(PIN, str(rows))

    def test_the_workers_list_shows_pin_status_not_the_pin(self):
        WarehousePin.objects.filter(user=self.worker).update(locked_at=timezone.now())
        self.client.force_authenticate(self.admin)

        rows = self.client.get(WORKERS_URL, {"role": "worker"}).data["results"]

        status_by_id = {row["id"]: row["pin_status"] for row in rows}
        self.assertEqual(status_by_id[self.worker.pk], "locked")
        self.assertEqual(status_by_id[self.other.pk], "none")
        self.assertIsNone(status_by_id[self.office.pk])

    def test_the_idle_limit_still_applies_to_a_pin_session(self):
        self.on_device()
        self.pin_login()

        self.assertEqual(self.client.session[IDLE_SESSION_KEY], 30 * 60)


BOARD_URL = "/api/staff/warehouse/shipments/board/"
UNLOCK_URL = reverse("warehouse-unlock")


class PasswordThenPinTests(FloorTestCase):
    """A warehouse worker who signs in with a password, like a customer, gets
    the customer profile and nothing more until their e-mail and PIN open the
    warehouse."""

    def sign_in_with_password(self, email="wim@example.com"):
        response = self.client.post(
            reverse("login"), {"username": email, "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 200)

    def unlock(self, email="wim@example.com", pin=PIN):
        return self.client.post(UNLOCK_URL, {"email": email, "pin": pin}, format="json")

    def test_a_password_alone_does_not_open_the_warehouse(self):
        self.sign_in_with_password()

        self.assertEqual(self.client.get(PROFILE_URL).status_code, 200)
        self.assertFalse(self.client.get(PROFILE_URL).data["warehouse_unlocked"])
        self.assertEqual(self.client.get(BOARD_URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_their_e_mail_and_pin_open_it(self):
        self.sign_in_with_password()

        response = self.unlock()

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.client.get(BOARD_URL).status_code, 200)
        profile = self.client.get(PROFILE_URL).data
        self.assertTrue(profile["warehouse_unlocked"])
        # On the floor's terms: the short idle session.
        self.assertEqual(profile["session_idle_seconds"], 30 * 60)
        self.assertTrue(FloorEvent.objects.filter(kind=FloorEvent.Kind.PIN_UNLOCK, user=self.worker).exists())

    def test_the_address_must_be_their_own(self):
        """Not a way to open the warehouse with somebody else's details."""
        floor.set_pin(self.other, "5937")
        self.sign_in_with_password()

        response = self.unlock(email="ana@example.com", pin="5937")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.get(BOARD_URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_wrong_pins_count_towards_the_same_lock(self):
        self.sign_in_with_password()

        for _ in range(floor.MAX_PIN_ATTEMPTS):
            self.assertEqual(self.unlock(pin=WRONG_PIN).status_code, 401)

        self.assertEqual(self.unlock().status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(self.client.get(PROFILE_URL).data["pin_locked"])
        self.assertEqual(self.client.get(BOARD_URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_one_answer_for_every_way_it_can_be_wrong(self):
        self.sign_in_with_password()

        for email, pin in [("wim@example.com", WRONG_PIN), ("nobody@example.com", PIN), ("wim@example.com", "12")]:
            response = self.unlock(email=email, pin=pin)
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
            self.assertEqual(response.data, {"detail": "That e-mail address or PIN is not right."})

    def test_it_is_for_warehouse_workers_only(self):
        for email in ["kantoor@example.com", "klant@example.com"]:
            self.client.post(reverse("logout"))
            self.sign_in_with_password(email)
            self.assertEqual(self.unlock(email=email).status_code, status.HTTP_403_FORBIDDEN)

    def test_nor_for_anybody_signed_out(self):
        self.assertEqual(self.unlock().status_code, status.HTTP_403_FORBIDDEN)

    def test_a_code_or_pin_sign_in_is_already_open(self):
        self.on_device()
        self.pin_login()
        self.assertEqual(self.client.get(BOARD_URL).status_code, 200)

        self.client.post(reverse("logout"))
        with patch("accounts.signin_codes.secrets.randbelow", return_value=4821):
            from .signin_codes import issue_code

            issue_code(self.other, self.admin)
        self.client.post(CODE_LOGIN_URL, {"email": "ana@example.com", "code": "4821"}, format="json")
        self.assertEqual(self.client.get(BOARD_URL).status_code, 200)

    def test_the_office_is_not_asked(self):
        self.sign_in_with_password("kantoor@example.com")

        self.assertEqual(self.client.get(BOARD_URL).status_code, 200)


SETUP_URL = reverse("warehouse-pin-setup")


class PinSetupOnProfileTests(FloorTestCase):
    """A worker signed in with a password, with no PIN yet (or a locked one),
    sets one on the profile page with a sign-in code and goes straight in."""

    def setUp(self):
        super().setUp()
        self.client.post(
            reverse("login"), {"username": "ana@example.com", "password": PASSWORD}, format="json"
        )

    def issue(self, user=None, code=4821):
        from .signin_codes import issue_code

        with patch("accounts.signin_codes.secrets.randbelow", return_value=code):
            issue_code(user or self.other, self.admin)
        return f"{code:04d}"

    def setup_pin(self, code, pin="5937"):
        return self.client.post(SETUP_URL, {"code": code, "pin": pin}, format="json")

    def test_a_code_sets_the_pin_and_opens_the_warehouse(self):
        code = self.issue()

        response = self.setup_pin(code)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.client.get(BOARD_URL).status_code, 200)
        profile = self.client.get(PROFILE_URL).data
        self.assertTrue(profile["has_pin"])
        self.assertTrue(profile["warehouse_unlocked"])
        self.assertTrue(FloorEvent.objects.filter(kind=FloorEvent.Kind.PIN_SET, user=self.other).exists())
        # The new PIN works on a floor device too.
        self.client.post(reverse("logout"))
        self.on_device()
        self.assertEqual(self.pin_login(worker=self.other, pin="5937").status_code, 200)

    def test_the_code_works_once(self):
        code = self.issue()
        self.setup_pin(code)

        self.assertEqual(self.setup_pin(code, pin="6048").status_code, status.HTTP_401_UNAUTHORIZED)

    def test_an_easy_pin_is_refused_without_spending_the_code(self):
        code = self.issue()

        response = self.setup_pin(code, pin="1234")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("pin", response.data)
        self.assertEqual(self.setup_pin(code).status_code, status.HTTP_204_NO_CONTENT)

    def test_a_wrong_code_sets_nothing(self):
        self.issue()

        response = self.setup_pin("0000")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(WarehousePin.objects.filter(user=self.other).exists())
        self.assertEqual(self.client.get(BOARD_URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_somebody_elses_code_does_nothing(self):
        wims_code = self.issue(user=self.worker, code=7391)

        self.assertEqual(self.setup_pin(wims_code).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(WarehousePin.objects.filter(user=self.other).exists())

    def test_it_replaces_a_locked_pin(self):
        floor.set_pin(self.other, "2468")
        WarehousePin.objects.filter(user=self.other).update(
            failed_attempts=floor.MAX_PIN_ATTEMPTS, locked_at=timezone.now()
        )

        self.setup_pin(self.issue())

        row = self.pin_row(self.other)
        self.assertIsNone(row.locked_at)
        self.assertEqual(row.failed_attempts, 0)

    def test_it_is_for_warehouse_workers_only(self):
        self.client.post(reverse("logout"))
        self.client.post(
            reverse("login"), {"username": "kantoor@example.com", "password": PASSWORD}, format="json"
        )

        self.assertEqual(self.setup_pin("4821").status_code, status.HTTP_403_FORBIDDEN)
