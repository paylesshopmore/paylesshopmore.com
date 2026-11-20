"""The dashboard's Website page (staff/site_settings.py)."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import SiteSettings
from config.testing import ReauthenticatedAPIClient

User = get_user_model()


class SiteSettingsTests(APITestCase):
    client_class = ReauthenticatedAPIClient

    def setUp(self):
        self.url = reverse("staff-site-settings")
        self.admin = User.objects.create_user(
            username="admin@example.com",
            email="admin@example.com",
            password="a-long-enough-password",
            role=User.Role.ADMIN,
        )
        self.office = User.objects.create_user(
            username="office@example.com",
            email="office@example.com",
            password="a-long-enough-password",
            role=User.Role.OFFICE,
        )

    def test_an_admin_can_switch_the_calculator_off_and_on(self):
        self.client.force_authenticate(self.admin)
        self.assertTrue(self.client.get(self.url).data["show_calculator"])

        response = self.client.put(self.url, {"show_calculator": False}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(SiteSettings.load().show_calculator)
        # The public site sees the change straight away.
        self.assertFalse(self.client.get(reverse("site-switches")).data["show_calculator"])

        self.client.put(self.url, {"show_calculator": True}, format="json")
        self.assertTrue(SiteSettings.load().show_calculator)

    def test_the_pay_online_page_starts_off_and_an_admin_can_switch_it_on(self):
        self.client.force_authenticate(self.admin)
        self.assertFalse(self.client.get(self.url).data["show_pay_online"])
        self.assertFalse(self.client.get(reverse("site-switches")).data["show_pay_online"])

        self.client.put(self.url, {"show_pay_online": True}, format="json")
        self.assertTrue(SiteSettings.load().show_pay_online)
        self.assertTrue(self.client.get(reverse("site-switches")).data["show_pay_online"])

    def test_only_a_real_true_or_false_is_accepted(self):
        self.client.force_authenticate(self.admin)
        response = self.client.put(self.url, {"show_calculator": "false"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(SiteSettings.load().show_calculator)

    def test_office_workers_and_visitors_cannot_change_it(self):
        self.client.force_authenticate(self.office)
        response = self.client.put(self.url, {"show_calculator": False}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(None)
        response = self.client.put(self.url, {"show_calculator": False}, format="json")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

        self.assertTrue(SiteSettings.load().show_calculator)


class AboutPageEditorTests(APITestCase):
    """The Website page's About us editor: admins only, and all or nothing."""

    client_class = ReauthenticatedAPIClient

    def setUp(self):
        self.url = reverse("staff-about-page")
        self.admin = User.objects.create_user(
            username="admin@example.com",
            email="admin@example.com",
            password="a-long-enough-password",
            role=User.Role.ADMIN,
        )
        self.office = User.objects.create_user(
            username="office@example.com",
            email="office@example.com",
            password="a-long-enough-password",
            role=User.Role.OFFICE,
        )

    def test_an_admin_can_change_the_years_and_the_words(self):
        self.client.force_authenticate(self.admin)
        response = self.client.put(
            self.url,
            {"years_in_business": 15, "headline_nl": "  Nieuwe kop ", "story_en": "Our story."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["years_in_business"], 15)
        self.assertEqual(response.data["headline_nl"], "Nieuwe kop")
        # The public page sees it straight away; what was not sent is untouched.
        public = self.client.get(reverse("about-page")).data
        self.assertEqual(public["years_in_business"], 15)
        self.assertEqual(public["story"]["en"], "Our story.")
        self.assertEqual(public["intro"]["nl"], "")

    def test_one_bad_value_saves_nothing(self):
        self.client.force_authenticate(self.admin)
        response = self.client.put(
            self.url, {"headline_nl": "Fine", "years_in_business": True}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("years_in_business", response.data)
        self.assertEqual(self.client.get(self.url).data["headline_nl"], "")

    def test_only_an_admin_may_open_or_change_it(self):
        for user in (self.office, None):
            self.client.force_authenticate(user)
            self.assertIn(
                self.client.get(self.url).status_code,
                (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
            )
            self.assertIn(
                self.client.put(self.url, {"years_in_business": 20}, format="json").status_code,
                (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
            )


class MaintenanceModeTests(AboutPageEditorTests):
    """The maintenance switch: off by default, admins only, public to read."""

    def test_it_starts_off_and_an_admin_can_switch_it_on_and_off(self):
        site_url = reverse("staff-site-settings")
        self.client.force_authenticate(self.admin)
        self.assertFalse(self.client.get(reverse("site-switches")).data["maintenance_mode"])

        self.client.put(site_url, {"maintenance_mode": True}, format="json")
        # Anyone can read it: the website needs to know whether to close.
        self.client.force_authenticate(None)
        self.assertTrue(self.client.get(reverse("site-switches")).data["maintenance_mode"])

        self.client.force_authenticate(self.admin)
        self.client.put(site_url, {"maintenance_mode": False}, format="json")
        self.assertFalse(SiteSettings.load().maintenance_mode)

    def test_office_workers_cannot_close_the_website(self):
        self.client.force_authenticate(self.office)
        response = self.client.put(
            reverse("staff-site-settings"), {"maintenance_mode": True}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(SiteSettings.load().maintenance_mode)


class AboutSwitchTests(AboutPageEditorTests):
    """The About us page's on/off switch: on by default, admins only."""

    def test_it_starts_on_and_an_admin_can_switch_it_off_and_on(self):
        site_url = reverse("staff-site-settings")
        self.client.force_authenticate(self.admin)
        self.assertTrue(self.client.get(reverse("site-switches")).data["show_about_page"])

        self.client.put(site_url, {"show_about_page": False}, format="json")
        self.client.force_authenticate(None)
        self.assertFalse(self.client.get(reverse("site-switches")).data["show_about_page"])

        self.client.force_authenticate(self.admin)
        self.client.put(site_url, {"show_about_page": True}, format="json")
        self.assertTrue(SiteSettings.load().show_about_page)

    def test_office_workers_cannot_switch_it(self):
        self.client.force_authenticate(self.office)
        response = self.client.put(
            reverse("staff-site-settings"), {"show_about_page": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(SiteSettings.load().show_about_page)
