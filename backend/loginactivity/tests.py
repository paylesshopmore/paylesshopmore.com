"""Tests for the login activity map (loginactivity/).

What is checked, in the order of the file:

  1. Tracking     every sign-in attempt is recorded, safely: no password, no
                  session key, the real IP address, browser, device, method.
  2. Geolocation  the place comes from the IP address, is cached, and private
                  addresses are never sent anywhere.
  3. Rules        each security rule flags what it should, and ONLY that.
                  A new country or device is a notice, never "suspicious".
  4. Permissions  office staff and admins only - everybody else is refused.
  5. The API      filters, pagination, sorting, the cards, the map.
  6. Export       the CSV is guarded and safe to open in a spreadsheet.
  7. Retention    old records are deleted, recent ones kept.
"""

import csv
import io
from datetime import timedelta
from unittest import mock

from django.conf import settings as django_settings
from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.core.management import call_command
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.settings import api_settings
from rest_framework.test import APIClient

from config.testing import ThrottleFreeAPITestCase, WarehouseAPITestCase

from . import client, geo, security
from .models import BlockedIP, LoginActivity, SecuritySettings

User = get_user_model()

PASSWORD = "a-long-enough-password"
CHROME_WINDOWS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)
SAFARI_IPHONE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)


def make_user(email, **extra):
    return User.objects.create_user(username=email, email=email, password=PASSWORD, **extra)


def make_row(**extra):
    """A log row, with sensible defaults for everything a test does not care about."""
    values = {
        "identifier": "john@example.com",
        "ip_address": "203.0.113.10",
        "status": LoginActivity.Status.SUCCESS,
        "method": "password",
        "browser": "Chrome",
        "os": "Windows 10/11",
        "device_type": "desktop",
        "country": "Netherlands",
        "country_code": "NL",
        "city": "Rotterdam",
        "latitude": 51.92,
        "longitude": 4.48,
    }
    values.update(extra)
    return LoginActivity.objects.create(**values)


# ---------------------------------------------------------------------------
# 1. Tracking
# ---------------------------------------------------------------------------


class UserAgentTests(ThrottleFreeAPITestCase):
    def test_chrome_on_windows(self):
        found = client.describe_user_agent(CHROME_WINDOWS)
        self.assertEqual(found, {"browser": "Chrome", "os": "Windows 10/11", "device_type": "desktop"})

    def test_safari_on_an_iphone(self):
        found = client.describe_user_agent(SAFARI_IPHONE)
        self.assertEqual(found, {"browser": "Safari", "os": "iPhone (iOS)", "device_type": "mobile"})

    def test_edge_is_not_called_chrome(self):
        ua = CHROME_WINDOWS + " Edg/126.0.0.0"
        self.assertEqual(client.describe_user_agent(ua)["browser"], "Edge")

    def test_scripts_are_marked_as_bots(self):
        self.assertEqual(client.describe_user_agent("python-requests/2.31")["device_type"], "bot")

    def test_nothing_is_fine_too(self):
        self.assertEqual(client.describe_user_agent(""), {"browser": "", "os": "", "device_type": ""})


class ClientIPTests(ThrottleFreeAPITestCase):
    """The address must come from something the visitor cannot write."""

    class Request:
        def __init__(self, **meta):
            self.META = meta

    def test_a_forged_header_is_ignored_when_no_proxy_is_trusted(self):
        request = self.Request(REMOTE_ADDR="203.0.113.10", HTTP_X_FORWARDED_FOR="1.2.3.4")
        with override_settings(REST_FRAMEWORK={**django_settings.REST_FRAMEWORK, "NUM_PROXIES": None}):
            self.assertEqual(client.client_ip(request), "203.0.113.10")

    def test_one_trusted_proxy_means_the_last_entry_counts(self):
        # The visitor wrote "9.9.9.9"; our own proxy appended the real address.
        request = self.Request(REMOTE_ADDR="10.0.0.1", HTTP_X_FORWARDED_FOR="9.9.9.9, 198.51.100.7")
        with override_settings(REST_FRAMEWORK={**django_settings.REST_FRAMEWORK, "NUM_PROXIES": 1}):
            self.assertEqual(client.client_ip(request), "198.51.100.7")

    def test_garbage_is_not_an_address(self):
        request = self.Request(REMOTE_ADDR="not-an-ip")
        self.assertIsNone(client.client_ip(request))

    def test_private_addresses_are_not_public(self):
        for address in ("127.0.0.1", "192.168.1.5", "10.0.0.9", "::1"):
            self.assertFalse(client.is_public_ip(address), address)

    def test_a_normal_public_address_is_public(self):
        self.assertTrue(client.is_public_ip("8.8.8.8"))


class RecordingTests(ThrottleFreeAPITestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user("john@example.com")

    def sign_in(self, password=PASSWORD, email="john@example.com", agent=CHROME_WINDOWS, ip="8.8.8.8"):
        return self.client.post(
            reverse("login"),
            {"username": email, "password": password},
            format="json",
            HTTP_USER_AGENT=agent,
            REMOTE_ADDR=ip,
        )

    def test_a_successful_sign_in_is_recorded(self):
        self.assertEqual(self.sign_in().status_code, status.HTTP_200_OK)
        row = LoginActivity.objects.get()
        self.assertEqual(row.status, LoginActivity.Status.SUCCESS)
        self.assertEqual(row.user, self.user)
        self.assertEqual(row.identifier, "john@example.com")
        self.assertEqual(row.ip_address, "8.8.8.8")
        self.assertEqual((row.browser, row.os, row.device_type), ("Chrome", "Windows 10/11", "desktop"))
        self.assertEqual(row.method, "password")

    def test_a_failed_sign_in_is_recorded_too(self):
        self.assertEqual(self.sign_in(password="wrong").status_code, status.HTTP_401_UNAUTHORIZED)
        row = LoginActivity.objects.get()
        self.assertEqual(row.status, LoginActivity.Status.FAILED)
        self.assertEqual(row.identifier, "john@example.com")
        self.assertEqual(row.ip_address, "8.8.8.8")

    def test_a_failed_sign_in_for_an_unknown_account_is_recorded(self):
        self.sign_in(email="nobody@example.com", password="x")
        row = LoginActivity.objects.get()
        self.assertEqual(row.status, LoginActivity.Status.FAILED)
        self.assertIsNone(row.user)
        self.assertEqual(row.identifier, "nobody@example.com")

    def test_no_password_and_no_session_key_is_ever_stored(self):
        self.sign_in(password="wrong-password-123")
        self.sign_in()
        session_key = self.client.session.session_key
        everything = " ".join(
            str(value)
            for row in LoginActivity.objects.all()
            for value in row.__dict__.values()
        )
        self.assertNotIn("wrong-password-123", everything)
        self.assertNotIn(PASSWORD, everything)
        self.assertTrue(session_key)
        self.assertNotIn(session_key, everything)
        # Only a short one-way fingerprint of the session is kept.
        success = LoginActivity.objects.get(status=LoginActivity.Status.SUCCESS)
        self.assertEqual(len(success.session_hash), 16)

    def test_a_forged_forwarded_header_does_not_set_the_recorded_address(self):
        response = self.client.post(
            reverse("login"),
            {"username": "john@example.com", "password": "nope"},
            format="json",
            REMOTE_ADDR="8.8.4.4",
            HTTP_X_FORWARDED_FOR="1.2.3.4",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(LoginActivity.objects.get().ip_address, "8.8.4.4")

    def test_a_wrong_warehouse_pin_is_recorded(self):
        self.client.post(
            reverse("warehouse-login"),
            {"email": "worker@example.com", "pin": "1234"},
            format="json",
            REMOTE_ADDR="8.8.8.8",
        )
        row = LoginActivity.objects.get()
        self.assertEqual((row.status, row.method, row.identifier), ("failed", "email_pin", "worker@example.com"))
        self.assertNotIn("1234", str(row.__dict__.values()))

    def test_a_wrong_emailed_code_is_recorded(self):
        self.client.post(
            reverse("code-login"),
            {"email": "worker@example.com", "code": "0000"},
            format="json",
            REMOTE_ADDR="8.8.8.8",
        )
        row = LoginActivity.objects.get()
        self.assertEqual((row.status, row.method), ("failed", "email_code"))

    def test_a_logging_problem_never_breaks_signing_in(self):
        with mock.patch.object(LoginActivity, "save", side_effect=RuntimeError("database down")):
            with self.assertLogs("loginactivity.recorder", level="ERROR"):
                response = self.sign_in()
        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# 2. Geolocation
# ---------------------------------------------------------------------------

ROTTERDAM = {
    "country": "Netherlands",
    "country_code": "NL",
    "region": "South Holland",
    "city": "Rotterdam",
    "latitude": 51.92,
    "longitude": 4.48,
}


@override_settings(LOGIN_GEO_PROVIDER="ipwhois")
class GeolocationTests(ThrottleFreeAPITestCase):
    def test_the_place_is_filled_in_after_a_sign_in(self):
        make_user("john@example.com")
        with mock.patch.dict(geo.PROVIDERS, {"ipwhois": mock.Mock(return_value=ROTTERDAM)}):
            with self.captureOnCommitCallbacks(execute=True):
                self.client.post(
                    reverse("login"),
                    {"username": "john@example.com", "password": PASSWORD},
                    format="json",
                    REMOTE_ADDR="8.8.8.8",
                )
        row = LoginActivity.objects.get()
        self.assertEqual((row.country, row.country_code, row.city), ("Netherlands", "NL", "Rotterdam"))
        self.assertEqual((row.latitude, row.longitude), (51.92, 4.48))

    def test_private_addresses_are_never_sent_to_the_service(self):
        provider = mock.Mock(return_value=ROTTERDAM)
        with mock.patch.dict(geo.PROVIDERS, {"ipwhois": provider}):
            for address in ("127.0.0.1", "192.168.0.4", "10.1.1.1"):
                self.assertIsNone(geo.locate(address))
        provider.assert_not_called()

    def test_each_address_is_looked_up_once(self):
        provider = mock.Mock(return_value=ROTTERDAM)
        with mock.patch.dict(geo.PROVIDERS, {"ipwhois": provider}):
            geo.locate("8.8.8.8")
            geo.locate("8.8.8.8")
        self.assertEqual(provider.call_count, 1)

    def test_a_place_already_known_from_an_earlier_sign_in_is_reused(self):
        make_row(ip_address="8.8.4.4")
        provider = mock.Mock(return_value=None)
        with mock.patch.dict(geo.PROVIDERS, {"ipwhois": provider}):
            place = geo.locate("8.8.4.4")
        self.assertEqual(place["city"], "Rotterdam")
        provider.assert_not_called()

    def test_a_failing_service_gives_an_unknown_place_not_an_error(self):
        with mock.patch.dict(geo.PROVIDERS, {"ipwhois": mock.Mock(side_effect=OSError("timeout"))}):
            self.assertIsNone(geo.locate("1.1.1.1"))

    def test_coordinates_are_rounded_to_about_a_kilometre(self):
        found = geo._clean("X", "XX", "", "", 51.923456, 4.481234)
        self.assertEqual((found["latitude"], found["longitude"]), (51.92, 4.48))

    def test_switched_off_means_no_lookups(self):
        provider = mock.Mock(return_value=ROTTERDAM)
        with override_settings(LOGIN_GEO_PROVIDER="none"):
            with mock.patch.dict(geo.PROVIDERS, {"ipwhois": provider}):
                self.assertIsNone(geo.locate("8.8.8.8"))
        provider.assert_not_called()


# ---------------------------------------------------------------------------
# 3. Security rules
# ---------------------------------------------------------------------------


class RuleTests(ThrottleFreeAPITestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user("john@example.com")
        self.now = timezone.now()

    def check(self, row):
        return security.evaluate(row)

    def failures(self, count, **extra):
        for number in range(count):
            make_row(
                status=LoginActivity.Status.FAILED,
                created_at=self.now - timedelta(minutes=count - number),
                **extra,
            )

    def test_a_normal_sign_in_is_normal(self):
        row = make_row(user=self.user)
        self.assertEqual(self.check(row), ("normal", []))

    def test_many_failures_from_one_address_are_suspicious(self):
        self.failures(5, identifier="a@example.com")  # default threshold: 5
        latest = make_row(status="failed", identifier="b@example.com", created_at=self.now)
        status_, flags = self.check(latest)
        self.assertEqual(status_, "suspicious")
        self.assertIn("many_failures_ip", flags)

    def test_a_few_failures_are_not(self):
        self.failures(2)
        latest = make_row(status="failed", created_at=self.now)
        self.assertEqual(self.check(latest), ("normal", []))

    def test_failures_outside_the_time_window_do_not_count(self):
        for number in range(6):
            make_row(status="failed", created_at=self.now - timedelta(hours=3, minutes=number))
        self.assertEqual(self.check(make_row(status="failed", created_at=self.now)), ("normal", []))

    def test_many_failures_against_one_account_from_many_addresses(self):
        for number in range(5):
            make_row(
                status="failed",
                ip_address=f"198.51.100.{number + 1}",
                created_at=self.now - timedelta(minutes=number + 1),
            )
        latest = make_row(status="failed", ip_address="198.51.100.99", created_at=self.now)
        status_, flags = self.check(latest)
        self.assertEqual(status_, "suspicious")
        self.assertIn("many_failures_account", flags)
        self.assertNotIn("many_failures_ip", flags)

    def test_getting_in_right_after_many_failures_is_suspicious(self):
        for number in range(5):
            make_row(
                status="failed",
                ip_address=f"198.51.100.{number + 1}",
                created_at=self.now - timedelta(minutes=number + 1),
            )
        success = make_row(user=self.user, ip_address="198.51.100.50", created_at=self.now)
        status_, flags = self.check(success)
        self.assertEqual(status_, "suspicious")
        self.assertIn("success_after_failures", flags)

    def test_several_countries_within_the_window_are_suspicious(self):
        for number, code in enumerate(("NL", "US", "JP")):
            make_row(
                user=self.user,
                country_code=code,
                country=code,
                ip_address=f"198.51.100.{number + 1}",
                created_at=self.now - timedelta(minutes=number * 5),
            )
        latest = LoginActivity.objects.filter(country_code="NL").get()
        status_, flags = self.check(latest)
        self.assertEqual(status_, "suspicious")
        self.assertIn("many_countries", flags)

    def test_two_countries_are_not_enough(self):
        make_row(user=self.user, country_code="NL", created_at=self.now - timedelta(minutes=5))
        row = make_row(user=self.user, country_code="CW", country="Curaçao", created_at=self.now)
        self.assertNotIn("many_countries", self.check(row)[1])

    def test_a_new_device_is_only_a_notice(self):
        make_row(user=self.user, created_at=self.now - timedelta(days=2))
        new = make_row(
            user=self.user, browser="Safari", os="iPhone (iOS)", device_type="mobile", created_at=self.now
        )
        status_, flags = self.check(new)
        self.assertEqual(flags, ["new_device"])
        self.assertEqual(status_, "notice")

    def test_the_first_ever_sign_in_is_not_a_new_device(self):
        self.assertEqual(self.check(make_row(user=self.user, created_at=self.now)), ("normal", []))

    def test_a_new_country_is_only_a_notice_and_never_suspicious(self):
        for days in range(1, 5):
            make_row(user=self.user, created_at=self.now - timedelta(days=days))
        abroad = make_row(user=self.user, country_code="CW", country="Curaçao", created_at=self.now)
        status_, flags = self.check(abroad)
        self.assertEqual(flags, ["new_country"])
        self.assertEqual(status_, "notice")
        self.assertNotEqual(status_, "suspicious")

    def test_a_new_country_needs_some_history_first(self):
        make_row(user=self.user, created_at=self.now - timedelta(days=1))  # only one earlier sign-in
        abroad = make_row(user=self.user, country_code="CW", country="Curaçao", created_at=self.now)
        self.assertNotIn("new_country", self.check(abroad)[1])

    def test_a_blocked_address_is_flagged(self):
        BlockedIP.objects.create(ip_address="203.0.113.10")
        status_, flags = self.check(make_row(status="failed", created_at=self.now))
        self.assertEqual((status_, flags), ("blocked", ["blocked_ip"]))

    def test_the_thresholds_can_be_changed(self):
        settings_row = SecuritySettings.current()
        settings_row.failed_per_ip = 2
        settings_row.save()
        self.failures(1)
        latest = make_row(status="failed", created_at=self.now)
        self.assertIn("many_failures_ip", self.check(latest)[1])

    def test_the_settings_row_is_a_single_row(self):
        SecuritySettings.current()
        SecuritySettings(failed_per_ip=9).save()
        self.assertEqual(SecuritySettings.objects.count(), 1)
        self.assertEqual(SecuritySettings.current().failed_per_ip, 9)


class BlockedAddressTests(ThrottleFreeAPITestCase):
    def test_a_blocked_address_cannot_sign_in_and_is_logged(self):
        make_user("john@example.com")
        BlockedIP.objects.create(ip_address="8.8.8.8", reason="Too many guesses")
        response = self.client.post(
            reverse("login"),
            {"username": "john@example.com", "password": PASSWORD},
            format="json",
            REMOTE_ADDR="8.8.8.8",
        )
        # The same answer as a wrong password: the address learns nothing.
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn("_auth_user_id", self.client.session)
        row = LoginActivity.objects.get()
        self.assertEqual((row.status, row.security_status), ("failed", "blocked"))
        self.assertIn("blocked_ip", row.flags)

    def test_other_addresses_are_not_affected(self):
        make_user("john@example.com")
        BlockedIP.objects.create(ip_address="8.8.8.8")
        response = self.client.post(
            reverse("login"),
            {"username": "john@example.com", "password": PASSWORD},
            format="json",
            REMOTE_ADDR="8.8.4.4",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class MissingTableTests(ThrottleFreeAPITestCase):
    """Signing in must keep working even when the login log cannot be used,
    for example on a computer where the migration has not been run yet."""

    def test_signing_in_still_works_when_the_block_list_cannot_be_read(self):
        make_user("john@example.com")
        with mock.patch.object(BlockedIP.objects, "filter", side_effect=RuntimeError("no such table")):
            with self.assertLogs("loginactivity.security", level="ERROR"):
                response = self.client.post(
                    reverse("login"),
                    {"username": "john@example.com", "password": PASSWORD},
                    format="json",
                    REMOTE_ADDR="8.8.8.8",
                )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_an_unreadable_block_list_means_not_blocked(self):
        with mock.patch.object(BlockedIP.objects, "filter", side_effect=RuntimeError("boom")):
            with self.assertLogs("loginactivity.security", level="ERROR"):
                self.assertFalse(security.is_blocked("8.8.8.8"))


class RulesApplyOnRealSignInTests(ThrottleFreeAPITestCase):
    def test_guessing_then_getting_in_shows_up_as_suspicious(self):
        make_user("john@example.com")
        for _ in range(5):
            self.client.post(
                reverse("login"),
                {"username": "john@example.com", "password": "wrong"},
                format="json",
                REMOTE_ADDR="8.8.8.8",
            )
        self.client.post(
            reverse("login"),
            {"username": "john@example.com", "password": PASSWORD},
            format="json",
            REMOTE_ADDR="8.8.8.8",
        )
        last = LoginActivity.objects.order_by("-id").first()
        self.assertEqual(last.status, "success")
        self.assertEqual(last.security_status, "suspicious")
        self.assertIn("success_after_failures", last.flags)


# ---------------------------------------------------------------------------
# 4. Permissions
# ---------------------------------------------------------------------------

ENDPOINTS = [
    ("login-activity", []),
    ("login-activity-stats", []),
    ("login-activity-map", []),
    ("login-activity-suspicious", []),
    ("login-activity-export", []),
]


class PermissionTests(WarehouseAPITestCase):
    def setUp(self):
        self.customer = make_user("klant@example.com")
        self.office = make_user("kantoor@example.com", role="office")
        self.admin = make_user("admin@example.com", role="admin")
        self.worker = make_user("wim@example.com", role="warehouse")
        self.manager = make_user("chef@example.com", role="manager")
        make_row()

    def get(self, name, user=None, **params):
        self.client.force_authenticate(user)
        return self.client.get(reverse(name), params)

    def test_signed_out_visitors_are_refused_everywhere(self):
        for name, _ in ENDPOINTS:
            with self.subTest(name=name):
                self.assertIn(
                    self.get(name).status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
                )

    def test_customers_warehouse_staff_and_managers_are_refused(self):
        for user in (self.customer, self.worker, self.manager):
            for name, _ in ENDPOINTS:
                with self.subTest(user=user.email, name=name):
                    self.assertEqual(self.get(name, user).status_code, status.HTTP_403_FORBIDDEN)

    def test_the_office_and_admins_may_read_it(self):
        for user in (self.office, self.admin):
            for name in ("login-activity", "login-activity-stats", "login-activity-map", "login-activity-suspicious"):
                with self.subTest(user=user.email, name=name):
                    self.assertEqual(self.get(name, user).status_code, status.HTTP_200_OK)

    def test_nobody_can_write_through_the_list(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse("login-activity"), {"identifier": "x"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(self.client.delete(reverse("login-activity")).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_a_customer_cannot_review(self):
        row = make_row(security_status="suspicious")
        self.client.force_authenticate(self.customer)
        response = self.client.post(reverse("login-activity-review", args=[row.pk]))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------------------
# 5. The API
# ---------------------------------------------------------------------------


class ApiTests(ThrottleFreeAPITestCase):
    def setUp(self):
        super().setUp()
        self.office = make_user("kantoor@example.com", role="office")
        self.john = make_user("john@example.com")
        self.client.force_authenticate(self.office)
        self.now = timezone.now()

    def rows(self, **params):
        response = self.client.get(reverse("login-activity"), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data["results"]

    def test_the_table_shows_what_the_popup_needs(self):
        make_row(user=self.john)
        [row] = self.rows()
        wanted = ("identifier", "country", "city", "ip_address", "device", "browser")
        for key in (*wanted, "status", "security_status", "created_at"):
            self.assertIn(key, row)
        self.assertEqual((row["device"], row["browser"]), ("Windows 10/11", "Chrome"))
        # Nothing secret leaves the server.
        self.assertNotIn("session_hash", row)

    def test_pagination(self):
        for number in range(30):
            make_row(identifier=f"user{number}@example.com")
        response = self.client.get(reverse("login-activity"))
        self.assertEqual(response.data["count"], 30)
        self.assertEqual(len(response.data["results"]), 25)
        self.assertEqual(len(self.client.get(reverse("login-activity"), {"page": 2}).data["results"]), 5)

    def test_filter_by_period(self):
        make_row(identifier="today@example.com")
        make_row(identifier="lastweek@example.com", created_at=self.now - timedelta(days=5))
        make_row(identifier="lastmonth@example.com", created_at=self.now - timedelta(days=20))
        make_row(identifier="old@example.com", created_at=self.now - timedelta(days=60))
        names = lambda period: {row["identifier"] for row in self.rows(period=period)}  # noqa: E731
        self.assertEqual(names("today"), {"today@example.com"})
        self.assertEqual(names("7d"), {"today@example.com", "lastweek@example.com"})
        self.assertEqual(len(names("30d")), 3)
        self.assertEqual(len(self.rows()), 4)

    def test_filter_by_status_and_security(self):
        make_row(identifier="ok@example.com")
        make_row(identifier="bad@example.com", status="failed")
        make_row(identifier="odd@example.com", security_status="suspicious")
        make_row(identifier="note@example.com", security_status="notice")
        make_row(identifier="blk@example.com", security_status="blocked")
        ids = lambda **p: {row["identifier"] for row in self.rows(**p)}  # noqa: E731
        self.assertEqual(ids(status="failed"), {"bad@example.com"})
        self.assertEqual(ids(security="suspicious"), {"odd@example.com", "blk@example.com"})
        self.assertEqual(ids(security="notice"), {"note@example.com"})
        self.assertEqual(len(ids(security="flagged")), 3)

    def test_filter_by_country_and_unknown(self):
        make_row(identifier="nl@example.com")
        make_row(identifier="cw@example.com", country="Curaçao", country_code="CW")
        make_row(identifier="who@example.com", country="", country_code="", latitude=None, longitude=None)
        ids = lambda **p: {row["identifier"] for row in self.rows(**p)}  # noqa: E731
        self.assertEqual(ids(country="CW"), {"cw@example.com"})
        self.assertEqual(ids(country="curaçao"), {"cw@example.com"})
        self.assertEqual(ids(country="unknown"), {"who@example.com"})

    def test_filter_by_user_and_search(self):
        make_row(identifier="john@example.com", user=self.john)
        make_row(identifier="mary@example.com", city="Willemstad", ip_address="198.51.100.4")
        ids = lambda **p: {row["identifier"] for row in self.rows(**p)}  # noqa: E731
        self.assertEqual(ids(user=str(self.john.pk)), {"john@example.com"})
        self.assertEqual(ids(user="mary"), {"mary@example.com"})
        self.assertEqual(ids(search="Willem"), {"mary@example.com"})
        self.assertEqual(ids(search="198.51"), {"mary@example.com"})

    def test_sorting_only_by_allowed_columns(self):
        make_row(identifier="b@example.com", city="Zwolle")
        make_row(identifier="a@example.com", city="Amsterdam")
        self.assertEqual([r["city"] for r in self.rows(ordering="city")], ["Amsterdam", "Zwolle"])
        self.assertEqual([r["city"] for r in self.rows(ordering="-city")], ["Zwolle", "Amsterdam"])
        # A column that is not allowed is ignored, not passed to the database.
        self.assertEqual(len(self.rows(ordering="user__password")), 2)

    def test_the_cards_are_counted_from_real_rows(self):
        make_row(user=self.john)
        make_row(user=self.john, country="Curaçao", country_code="CW")
        make_row(status="failed", identifier="x@example.com", security_status="suspicious")
        make_row(
            status="failed", identifier="y@example.com", country="", country_code="", latitude=None, longitude=None
        )
        make_row(created_at=self.now - timedelta(days=3), user=self.office)
        # The signed-in test client already holds one real session, so count
        # from there: one more live session, and one expired one that must not count.
        sessions_before = Session.objects.filter(expire_date__gt=self.now).count()
        Session.objects.create(session_key="live", session_data="x", expire_date=self.now + timedelta(days=1))
        Session.objects.create(session_key="dead", session_data="x", expire_date=self.now - timedelta(days=1))

        stats = self.client.get(reverse("login-activity-stats")).data
        self.assertEqual(stats["total"], 5)
        self.assertEqual(stats["successful"], 3)
        self.assertEqual(stats["failed"], 2)
        self.assertEqual(stats["unique_users"], 2)
        self.assertEqual(stats["unique_countries"], 2)
        self.assertEqual(stats["suspicious"], 1)
        self.assertEqual(stats["last_24h"], 4)
        self.assertEqual(stats["active_sessions"], sessions_before + 1)

    def test_the_cards_follow_the_filters(self):
        make_row()
        make_row(status="failed")
        stats = self.client.get(reverse("login-activity-stats"), {"status": "failed"}).data
        self.assertEqual((stats["total"], stats["successful"], stats["failed"]), (1, 0, 1))

    def test_an_empty_database_gives_zeros_not_fake_numbers(self):
        stats = self.client.get(reverse("login-activity-stats")).data
        self.assertEqual(stats["retention_days"], 90)
        counted = {k: v for k, v in stats.items() if k not in ("active_sessions", "retention_days")}
        self.assertEqual(counted, {
            "total": 0, "successful": 0, "failed": 0, "suspicious": 0, "last_24h": 0,
            "unique_users": 0, "unique_countries": 0,
        })

    def test_the_map_has_points_a_heatmap_and_the_unknown(self):
        make_row(identifier="a@example.com")
        make_row(identifier="b@example.com")  # same spot: one hot spot of 2
        make_row(
            identifier="c@example.com",
            status="failed",
            country="Curaçao",
            country_code="CW",
            latitude=12.11,
            longitude=-68.93,
        )
        make_row(identifier="d@example.com", country="", country_code="", latitude=None, longitude=None)

        data = self.client.get(reverse("login-activity-map")).data
        self.assertEqual(len(data["points"]), 3)
        self.assertEqual(data["unknown"]["count"], 1)
        self.assertEqual(data["unknown"]["latest"][0]["identifier"], "d@example.com")
        self.assertEqual(sorted(spot["count"] for spot in data["heat"]), [1, 2])
        self.assertFalse(data["truncated"])
        point = data["points"][0]
        wanted = ("latitude", "longitude", "identifier", "country", "city", "ip_address", "device", "browser")
        for key in (*wanted, "created_at", "status", "security_status"):
            self.assertIn(key, point)

    def test_the_map_is_limited(self):
        with mock.patch("loginactivity.views.MAP_LIMIT", 2):
            for number in range(4):
                make_row(identifier=f"u{number}@example.com")
            data = self.client.get(reverse("login-activity-map")).data
        self.assertEqual(len(data["points"]), 2)
        self.assertTrue(data["truncated"])

    def test_suspicious_lists_flagged_attempts_unreviewed_first(self):
        old = make_row(
            identifier="old@example.com", security_status="suspicious", created_at=self.now - timedelta(days=1)
        )
        make_row(identifier="fine@example.com")
        make_row(identifier="note@example.com", security_status="notice")
        new = make_row(identifier="new@example.com", security_status="blocked")
        reviewed = make_row(identifier="done@example.com", security_status="suspicious")
        response = self.client.post(reverse("login-activity-review", args=[reviewed.pk]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        names = [row["identifier"] for row in self.client.get(reverse("login-activity-suspicious")).data["results"]]
        self.assertEqual(names, ["new@example.com", "old@example.com", "done@example.com"])
        self.assertEqual(new.security_status, "blocked")
        self.assertEqual(old.security_status, "suspicious")
        reviewed.refresh_from_db()
        self.assertEqual(reviewed.reviewed_by, self.office)
        open_ = self.client.get(reverse("login-activity-suspicious"), {"reviewed": "0"}).data["results"]
        self.assertEqual(len(open_), 2)


# ---------------------------------------------------------------------------
# 6. Export
# ---------------------------------------------------------------------------


class ExportTests(ThrottleFreeAPITestCase):
    def setUp(self):
        super().setUp()
        self.office = make_user("kantoor@example.com", role="office")
        self.customer = make_user("klant@example.com")
        self.client.force_authenticate(self.office)

    def download(self, **params):
        response = self.client.get(reverse("login-activity-export"), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = b"".join(response.streaming_content).decode("utf-8-sig")
        return response, list(csv.reader(io.StringIO(body)))

    def test_the_csv_has_a_header_and_the_rows(self):
        make_row()
        response, rows = self.download()
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        self.assertIn("attachment", response["Content-Disposition"])
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(rows[0][:3], ["Time", "Account", "IP address"])
        self.assertEqual(rows[1][1:4], ["john@example.com", "203.0.113.10", "Netherlands"])

    def test_the_csv_follows_the_filters(self):
        make_row(identifier="ok@example.com")
        make_row(identifier="bad@example.com", status="failed")
        _, rows = self.download(status="failed")
        self.assertEqual([row[1] for row in rows[1:]], ["bad@example.com"])

    def test_a_typed_formula_is_defused(self):
        make_row(identifier='=HYPERLINK("http://evil.example","click")', status="failed")
        make_row(identifier="+1234", status="failed")
        make_row(identifier="@SUM(1)", status="failed")
        _, rows = self.download()
        accounts = {row[1] for row in rows[1:]}
        for account in accounts:
            self.assertTrue(account.startswith("'"), account)

    def test_it_needs_a_recent_password_confirmation(self):
        # A plain client: no "just confirmed my password" in the session.
        plain = APIClient()
        plain.force_authenticate(self.office)
        response = plain.get(reverse("login-activity-export"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get("code"), "reauth_required")

    def test_the_check_says_how_many_rows_without_downloading(self):
        make_row()
        make_row()
        response = self.client.get(reverse("login-activity-export"), {"check": "1"})
        self.assertEqual(response.data, {"ok": True, "rows": 2})

    def test_a_customer_cannot_export(self):
        make_row()
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get(reverse("login-activity-export")).status_code, status.HTTP_403_FORBIDDEN)

    def test_the_file_is_capped(self):
        with mock.patch("loginactivity.views.EXPORT_LIMIT", 2):
            for number in range(4):
                make_row(identifier=f"u{number}@example.com")
            _, rows = self.download()
        self.assertEqual(len(rows) - 1, 2)

    def test_the_export_is_written_to_the_log(self):
        make_row()
        with self.assertLogs("loginactivity.views", level="INFO") as logged:
            self.download()
        self.assertIn(str(self.office.pk), logged.output[0])

    def test_the_export_is_rate_limited(self):
        make_row()
        from django.core.cache import cache

        cache.clear()
        statuses = [
            self.client.get(reverse("login-activity-export"), {"check": "1"}).status_code for _ in range(11)
        ]
        self.assertEqual(statuses[-1], status.HTTP_429_TOO_MANY_REQUESTS)


# ---------------------------------------------------------------------------
# 7. Retention
# ---------------------------------------------------------------------------


class RetentionTests(ThrottleFreeAPITestCase):
    def test_old_records_are_deleted_and_recent_ones_kept(self):
        now = timezone.now()
        make_row(identifier="recent@example.com", created_at=now - timedelta(days=10))
        make_row(identifier="old@example.com", created_at=now - timedelta(days=100))
        out = io.StringIO()
        call_command("purge_login_activity", stdout=out)
        self.assertEqual(list(LoginActivity.objects.values_list("identifier", flat=True)), ["recent@example.com"])
        self.assertIn("Deleted 1", out.getvalue())

    def test_dry_run_deletes_nothing(self):
        make_row(created_at=timezone.now() - timedelta(days=100))
        call_command("purge_login_activity", "--dry-run", stdout=io.StringIO())
        self.assertEqual(LoginActivity.objects.count(), 1)

    def test_the_period_is_a_setting(self):
        make_row(created_at=timezone.now() - timedelta(days=10))
        with override_settings(LOGIN_ACTIVITY_RETENTION_DAYS=5):
            call_command("purge_login_activity", stdout=io.StringIO())
        self.assertEqual(LoginActivity.objects.count(), 0)


class SettingsSanityTests(ThrottleFreeAPITestCase):
    def test_trusted_proxy_setting_is_read_from_drf(self):
        # Guards the one line client_ip() depends on.
        self.assertTrue(hasattr(api_settings, "NUM_PROXIES"))
