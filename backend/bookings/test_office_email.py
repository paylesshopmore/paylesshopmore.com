"""When somebody sends the booking form, the office gets an e-mail about it."""

from unittest import mock

from django.core import mail
from django.test import override_settings
from django.urls import reverse
from rest_framework import status

from config.testing import ThrottleFreeAPITestCase
from shops.models import Shop

from .models import Booking
from .tasks import send_new_booking_email
from .tests import payload

URL = reverse("booking-create")


@override_settings(
    BOOKING_NOTIFY_EMAILS=["info@paylesshopmore.com", "owner@example.com"],
    FRONTEND_URL="https://shop.paylesshopmore.com",
)
class NewBookingEmailTests(ThrottleFreeAPITestCase):
    def send(self, **overrides):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(URL, payload(**overrides), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return Booking.objects.get(pk=response.data["id"])

    def test_the_office_is_told_about_a_new_booking(self):
        booking = self.send()

        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["info@paylesshopmore.com", "owner@example.com"])
        self.assertIn(f"New booking #{booking.pk}", message.subject)
        self.assertIn("Voorbeeld Klant", message.subject)
        # Replying goes to the customer.
        self.assertEqual(message.reply_to, ["afzender@example.com"])
        self.assertIn("afzender@example.com", message.body)
        self.assertIn(
            f"https://shop.paylesshopmore.com/dashboard/bookings?booking={booking.pk}", message.body
        )
        booking.refresh_from_db()
        self.assertIsNotNone(booking.office_emailed_at)

    def test_the_stores_and_product_links_are_in_it(self):
        bol, _ = Shop.objects.get_or_create(name="bol.com", defaults={"url": "https://www.bol.com/"})
        data = payload()
        data.pop("contents")
        data["orders"] = [
            {
                "shop": bol.pk,
                "products": [
                    {"description": "White T-shirt", "url": "https://www.bol.com/nl/nl/p/shirt/1/"},
                ],
            }
        ]
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(URL, data, format="json")

        body = mail.outbox[0].body
        self.assertIn("bol.com: White T-shirt", body)
        self.assertIn("https://www.bol.com/nl/nl/p/shirt/1/", body)
        self.assertIn("ORDERS (1 supplier)", body)

    def test_never_twice_for_the_same_booking(self):
        booking = self.send()
        send_new_booking_email(booking.pk)
        self.assertEqual(len(mail.outbox), 1)

    def test_a_refused_booking_mails_nobody(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(URL, payload(agreed_terms=False), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(mail.outbox, [])

    @override_settings(BOOKING_NOTIFY_EMAILS=[])
    def test_nobody_set_means_no_mail(self):
        self.send()
        self.assertEqual(mail.outbox, [])

    def test_a_broken_mail_server_does_not_fail_the_booking(self):
        with mock.patch(
            "bookings.tasks.send_new_booking_email.delay", side_effect=RuntimeError("broker down")
        ):
            booking = self.send()
        self.assertTrue(Booking.objects.filter(pk=booking.pk).exists())
        self.assertEqual(mail.outbox, [])
