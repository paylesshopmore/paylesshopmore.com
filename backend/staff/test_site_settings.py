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
            username="admin@example.com", email="admin@example.com", password="a-long-enough-password", role=User.Role.ADMIN
        )
        self.office = User.objects.create_user(
            username="office@example.com", email="office@example.com", password="a-long-enough-password", role=User.Role.OFFICE
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
