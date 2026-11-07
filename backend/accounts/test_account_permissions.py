"""Who may open, change and switch off which warehouse accounts.

The rules, all checked on the server (staff/views.py CustomerViewSet,
staff/floor.py), whatever the browser sends:

  ADMIN    opens any account (workers, managers, office, admins), changes
           roles, switches accounts off, signs them out everywhere. Opening
           an account with power (admin, office, manager) asks for the
           password again first.
  MANAGER  opens warehouse WORKER accounts only, and looks after those
           workers: PINs, switching off, signing out. Cannot open managers or
           admins, change any role (their own included), or touch any account
           that is not a warehouse worker.
  WORKER   none of this.

Also here: a new worker gets a random PIN, shown once and stored as an
Argon2id hash; every account change lands in the append-only audit trail
(FloorEvent); switching off or changing a role ends every session at once;
and two-factor "required for administrators" covers managers too.
"""

import time
from unittest.mock import patch

from django.contrib.sessions.models import Session
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from . import reauth, twofactor
from .models import AuditRecordImmutable, FloorEvent, User, WarehousePin
from .test_floor import PASSWORD, FloorTestCase, make_account

CUSTOMERS = "/api/staff/customers/"
MANAGER_STATS = "/api/staff/warehouse/manager/stats/"


def new_account(email, role, **extra):
    return {
        "first_name": "Nieuw",
        "last_name": "Mens",
        "email": email,
        "phone_number": "+31 6 1234 5678",
        "role": role,
        **extra,
    }


def sessions_of(user):
    """How many live sessions belong to `user`."""
    return sum(
        1
        for session in Session.objects.all()
        if session.get_decoded().get("_auth_user_id") == str(user.pk)
    )


class AccountPermissionTestCase(FloorTestCase):
    client_class = APIClient

    def setUp(self):
        super().setUp()
        self.manager = make_account("chef@example.com", User.Role.MANAGER, "Max", "Chef")

    def sign_in(self, user):
        """A real password sign-in, so the session counts as just confirmed."""
        self.client.logout()
        response = self.client.post(
            reverse("login"), {"username": user.email, "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)

    def signed_in_elsewhere(self, user):
        """`user` signed in on another device: a session of their own."""
        other = APIClient()
        other.post(reverse("login"), {"username": user.email, "password": PASSWORD}, format="json")
        self.assertGreater(sessions_of(user), 0)
        return other

    def later(self):
        """A clock past the re-authentication window."""
        return patch(
            "accounts.reauth.time.time", return_value=time.time() + reauth.window_seconds() + 5
        )


class ManagerCreatesWorkersTests(AccountPermissionTestCase):
    def setUp(self):
        super().setUp()
        self.sign_in(self.manager)

    # The tests run with a fast hasher; this one uses the site's real one.
    @override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.Argon2PasswordHasher"])
    def test_opens_a_worker_with_a_pin_shown_once(self):
        response = self.client.post(CUSTOMERS, new_account("nieuw@example.com", "warehouse"), format="json")

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response["Cache-Control"], "no-store")
        pin = response.data["initial_pin"]
        self.assertRegex(pin, r"^\d{4}$")

        worker = User.objects.get(email="nieuw@example.com")
        self.assertEqual(worker.role, User.Role.WAREHOUSE)
        # Stored as an Argon2id hash, never as the PIN itself, and it must be
        # changed at the first sign-in.
        row = WarehousePin.objects.get(user=worker)
        self.assertTrue(row.pin_hash.startswith("argon2$argon2id$"))
        self.assertNotIn(pin, row.pin_hash)
        self.assertTrue(row.must_change)

        # Who opened it, as what: in the audit trail.
        created = FloorEvent.objects.get(kind=FloorEvent.Kind.ACCOUNT_CREATED, user=worker)
        self.assertEqual(created.actor, self.manager)
        self.assertEqual(created.details, {"role": "warehouse"})
        self.assertTrue(FloorEvent.objects.filter(kind=FloorEvent.Kind.PIN_ISSUED, user=worker).exists())

    def test_the_pin_is_never_shown_again(self):
        self.client.post(CUSTOMERS, new_account("nieuw@example.com", "warehouse"), format="json")
        worker = User.objects.get(email="nieuw@example.com")

        listing = self.client.get(CUSTOMERS)
        detail = self.client.get(f"{CUSTOMERS}{worker.pk}/")
        self.assertNotIn("initial_pin", str(listing.data))
        self.assertNotIn("initial_pin", detail.data)

    def test_cannot_open_anything_but_a_worker(self):
        for role in ("manager", "admin", "office", "driver", "customer"):
            with self.subTest(role=role):
                email = f"{role}-nieuw@example.com"
                response = self.client.post(CUSTOMERS, new_account(email, role), format="json")
                self.assertEqual(response.status_code, 403)
                self.assertFalse(User.objects.filter(email=email).exists())

    def test_refuses_a_duplicate_or_invalid_email(self):
        duplicate = self.client.post(CUSTOMERS, new_account("WIM@example.com", "warehouse"), format="json")
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("email", duplicate.data)

        invalid = self.client.post(CUSTOMERS, new_account("not-an-email", "warehouse"), format="json")
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("email", invalid.data)

    def test_extra_fields_cannot_sneak_in_power(self):
        response = self.client.post(
            CUSTOMERS,
            new_account("sneaky@example.com", "warehouse", is_staff=True, is_superuser=True),
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        sneaky = User.objects.get(email="sneaky@example.com")
        self.assertFalse(sneaky.is_staff)
        self.assertFalse(sneaky.is_superuser)
        self.assertEqual(sneaky.role, User.Role.WAREHOUSE)


class ManagerLimitsTests(AccountPermissionTestCase):
    def setUp(self):
        super().setUp()
        self.other_manager = make_account("tweede@example.com", User.Role.MANAGER, "Tess", "Tweede")
        self.sign_in(self.manager)

    def test_cannot_change_any_role_not_even_their_own(self):
        for target in (self.worker, self.manager, self.admin):
            with self.subTest(target=target.email):
                response = self.client.post(f"{CUSTOMERS}{target.pk}/role/", {"role": "manager"}, format="json")
                # 403 (refused) or 404 (not even visible to them).
                self.assertIn(response.status_code, (403, 404))
        self.worker.refresh_from_db()
        self.manager.refresh_from_db()
        self.assertEqual(self.worker.role, User.Role.WAREHOUSE)
        self.assertEqual(self.manager.role, User.Role.MANAGER)

    def test_cannot_touch_admins_office_or_other_managers(self):
        for target in (self.admin, self.office, self.other_manager, self.customer):
            with self.subTest(target=target.email):
                url = f"{CUSTOMERS}{target.pk}/"
                self.assertEqual(self.client.patch(url, {"email": "mine@example.com"}, format="json").status_code, 404)
                self.assertEqual(self.client.post(f"{url}active/", {"active": False}, format="json").status_code, 404)
                self.assertEqual(self.client.post(f"{url}sign-out-everywhere/").status_code, 404)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.email, "baas@example.com")
        self.assertTrue(self.other_manager.is_active)

    def test_cannot_reset_another_managers_pin(self):
        WarehousePin.objects.create(user=self.other_manager, pin_hash="x", set_at=timezone.now())
        response = self.client.post(f"/api/staff/workers/{self.other_manager.pk}/reset-pin/")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(WarehousePin.objects.filter(user=self.other_manager).exists())

    def test_cannot_delete_accounts(self):
        response = self.client.delete(f"{CUSTOMERS}{self.worker.pk}/")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(User.objects.filter(pk=self.worker.pk).exists())


class WorkerAccessTests(AccountPermissionTestCase):
    def test_a_worker_manages_nobody(self):
        self.client.force_login(self.worker)
        self.assertEqual(
            self.client.post(CUSTOMERS, new_account("x@example.com", "warehouse"), format="json").status_code, 403
        )
        self.assertEqual(self.client.get(CUSTOMERS).status_code, 403)
        self.assertEqual(self.client.get(MANAGER_STATS).status_code, 403)
        self.assertEqual(self.client.post(f"/api/staff/workers/{self.other.pk}/issue-pin/").status_code, 403)

    def test_office_staff_cannot_open_staff_accounts(self):
        self.sign_in(self.office)
        response = self.client.post(CUSTOMERS, new_account("x@example.com", "warehouse"), format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.post(f"{CUSTOMERS}{self.worker.pk}/sign-out-everywhere/").status_code, 403)


class AdminTests(AccountPermissionTestCase):
    def setUp(self):
        super().setUp()
        self.sign_in(self.admin)

    def test_opens_a_manager_and_it_is_on_the_record(self):
        response = self.client.post(CUSTOMERS, new_account("baas2@example.com", "manager"), format="json")

        self.assertEqual(response.status_code, 201, response.data)
        # A manager signs in with a password (and two-factor), not a PIN.
        self.assertNotIn("initial_pin", response.data)
        manager = User.objects.get(email="baas2@example.com")
        self.assertTrue(manager.is_warehouse_manager)
        created = FloorEvent.objects.get(kind=FloorEvent.Kind.ACCOUNT_CREATED, user=manager)
        self.assertEqual(created.actor, self.admin)

    def test_opening_a_powerful_account_asks_for_the_password_again(self):
        with self.later():
            response = self.client.post(CUSTOMERS, new_account("baas2@example.com", "manager"), format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "reauth_required")
        self.assertFalse(User.objects.filter(email="baas2@example.com").exists())

    def test_opening_a_worker_does_not(self):
        with self.later():
            response = self.client.post(CUSTOMERS, new_account("nieuw@example.com", "warehouse"), format="json")
        self.assertEqual(response.status_code, 201)

    def test_promoting_a_worker_is_recorded_and_starts_fresh(self):
        self.signed_in_elsewhere(self.worker)

        response = self.client.post(f"{CUSTOMERS}{self.worker.pk}/role/", {"role": "manager"}, format="json")

        self.assertEqual(response.status_code, 200)
        changed = FloorEvent.objects.get(kind=FloorEvent.Kind.ROLE_CHANGED, user=self.worker)
        self.assertEqual(changed.actor, self.admin)
        self.assertEqual(changed.details, {"from_role": "warehouse", "to_role": "manager"})
        # The floor PIN went with the worker role, and every session ended.
        self.assertFalse(WarehousePin.objects.filter(user=self.worker).exists())
        self.assertEqual(sessions_of(self.worker), 0)

    def test_signs_somebody_out_everywhere(self):
        self.signed_in_elsewhere(self.worker)

        response = self.client.post(f"{CUSTOMERS}{self.worker.pk}/sign-out-everywhere/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(sessions_of(self.worker), 0)
        self.worker.refresh_from_db()
        self.assertTrue(self.worker.is_active)  # signed out, not switched off
        event = FloorEvent.objects.get(kind=FloorEvent.Kind.SESSIONS_REVOKED, user=self.worker)
        self.assertEqual(event.actor, self.admin)

    def test_not_their_own_sessions_from_here(self):
        response = self.client.post(f"{CUSTOMERS}{self.admin.pk}/sign-out-everywhere/")
        self.assertEqual(response.status_code, 403)


class ManagerLooksAfterWorkersTests(AccountPermissionTestCase):
    def setUp(self):
        super().setUp()
        self.sign_in(self.manager)

    def test_switching_a_worker_off_ends_their_sessions_at_once(self):
        elsewhere = self.signed_in_elsewhere(self.worker)

        response = self.client.post(f"{CUSTOMERS}{self.worker.pk}/active/", {"active": False}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(sessions_of(self.worker), 0)
        # Signed out there too: the API no longer knows them.
        self.assertIn(elsewhere.get(reverse("profile")).status_code, (401, 403))
        self.assertTrue(
            FloorEvent.objects.filter(kind=FloorEvent.Kind.ACCOUNT_DEACTIVATED, user=self.worker).exists()
        )

    def test_signs_a_worker_out_everywhere(self):
        self.signed_in_elsewhere(self.worker)
        response = self.client.post(f"{CUSTOMERS}{self.worker.pk}/sign-out-everywhere/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(sessions_of(self.worker), 0)

    def test_sees_account_changes_in_the_activity_log(self):
        self.client.post(CUSTOMERS, new_account("nieuw@example.com", "warehouse"), format="json")
        log = self.client.get("/api/staff/warehouse/manager/activity/", {"action": "account_created"})
        self.assertEqual(log.status_code, 200)
        row = log.data["results"][0]
        self.assertEqual(row["worker"]["name"], "Max Chef")
        self.assertEqual(row["changes"], {"role": "warehouse"})


class AuditTrailIsAppendOnlyTests(AccountPermissionTestCase):
    def test_a_record_cannot_be_changed_or_deleted(self):
        event = FloorEvent.objects.create(kind=FloorEvent.Kind.PIN_RESET, user=self.worker, actor=self.admin)

        event.kind = FloorEvent.Kind.PIN_SET
        with self.assertRaises(AuditRecordImmutable):
            event.save()
        with self.assertRaises(AuditRecordImmutable):
            event.delete()
        with self.assertRaises(AuditRecordImmutable):
            FloorEvent.objects.filter(pk=event.pk).update(kind=FloorEvent.Kind.PIN_SET)
        with self.assertRaises(AuditRecordImmutable):
            FloorEvent.objects.all().delete()
        self.assertEqual(FloorEvent.objects.get(pk=event.pk).kind, FloorEvent.Kind.PIN_RESET)

    def test_deleting_an_account_keeps_its_records(self):
        event = FloorEvent.objects.create(kind=FloorEvent.Kind.PIN_RESET, user=self.customer, actor=self.admin)
        self.customer.delete()
        event.refresh_from_db()
        self.assertIsNone(event.user)


class TwoFactorForManagersTests(AccountPermissionTestCase):
    def test_required_for_administrators_covers_managers(self):
        mode = twofactor.Mode.REQUIRED_ADMINS
        self.assertTrue(twofactor.is_required_for(self.admin, mode))
        self.assertTrue(twofactor.is_required_for(self.manager, mode))
        self.assertFalse(twofactor.is_required_for(self.worker, mode))
        self.assertFalse(twofactor.is_required_for(self.office, mode))
        affected = {user.pk for user, _ in twofactor.accounts_affected(mode)}
        self.assertIn(self.manager.pk, affected)
        self.assertNotIn(self.worker.pk, affected)
