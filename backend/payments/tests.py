"""Tests for online invoice payment.

What carries the weight: the amount always comes from our database, a wrong or
already-paid number gets the same answer as an unknown one, and only a
correctly signed Stripe webhook can mark an invoice paid - once.
"""

from unittest import mock

import stripe
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from .models import PaymentInvoice


@override_settings(STRIPE_SECRET_KEY="sk_test_x", STRIPE_WEBHOOK_SECRET="whsec_x")
class CheckoutTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("payment-checkout")
        self.invoice = PaymentInvoice.objects.create(number="PLSM-10231", amount=12345)

    @mock.patch("payments.views.stripe.checkout.Session.create")
    def test_amount_comes_from_the_database_not_the_request(self, create):
        create.return_value = mock.Mock(url="https://checkout.stripe.test/x")
        response = self.client.post(
            self.url, {"number": " plsm-10231 ", "amount": 1}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"url": "https://checkout.stripe.test/x"})
        line = create.call_args.kwargs["line_items"][0]["price_data"]
        self.assertEqual(line["unit_amount"], 12345)
        self.assertEqual(create.call_args.kwargs["metadata"]["invoice_id"], str(self.invoice.pk))

    def test_unknown_badly_typed_and_paid_numbers_look_the_same(self):
        PaymentInvoice.objects.create(
            number="PLSM-99999", amount=100, status=PaymentInvoice.Status.PAID
        )
        answers = [
            self.client.post(self.url, {"number": number}, format="json")
            for number in ("PLSM-00000", "nonsense", "PLSM-99999", "")
        ]
        for response in answers:
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.data, answers[0].data)

    @mock.patch("payments.views.stripe.checkout.Session.create")
    def test_a_stripe_failure_is_a_generic_503(self, create):
        create.side_effect = stripe.APIConnectionError("boom")
        response = self.client.post(self.url, {"number": "PLSM-10231"}, format="json")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("boom", str(response.data))

    @override_settings(STRIPE_SECRET_KEY="")
    def test_without_a_stripe_key_it_is_unavailable(self):
        response = self.client.post(self.url, {"number": "PLSM-10231"}, format="json")
        self.assertEqual(response.status_code, 503)


@override_settings(STRIPE_SECRET_KEY="sk_test_x", STRIPE_WEBHOOK_SECRET="whsec_x")
class WebhookTests(TestCase):
    def setUp(self):
        self.url = reverse("payment-webhook")
        self.invoice = PaymentInvoice.objects.create(number="PLSM-10231", amount=12345)

    def event(self, **overrides):
        session = {
            "id": "cs_test_1",
            "payment_status": "paid",
            "amount_total": 12345,
            "currency": "eur",
            "metadata": {"invoice_id": str(self.invoice.pk)},
        }
        session.update(overrides)
        return {"type": "checkout.session.completed", "data": {"object": session}}

    def post(self, event):
        with mock.patch("payments.views.stripe.Webhook.construct_event", return_value=event):
            return self.client.post(
                self.url, data="{}", content_type="application/json", HTTP_STRIPE_SIGNATURE="sig"
            )

    def test_a_signed_payment_marks_the_invoice_paid_once(self):
        self.assertEqual(self.post(self.event()).status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "paid")
        first_paid_at = self.invoice.paid_at
        self.assertIsNotNone(first_paid_at)

        # The same event again changes nothing.
        self.assertEqual(self.post(self.event()).status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.paid_at, first_paid_at)

    def test_a_bad_signature_is_refused_and_nothing_changes(self):
        with mock.patch(
            "payments.views.stripe.Webhook.construct_event",
            side_effect=stripe.SignatureVerificationError("bad", "sig"),
        ):
            response = self.client.post(self.url, data="{}", content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "open")

    def test_an_unpaid_or_mismatched_session_does_not_mark_it_paid(self):
        self.post(self.event(payment_status="unpaid"))
        self.post(self.event(amount_total=1))
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "open")

    def test_other_events_are_acknowledged_and_ignored(self):
        event = self.event()
        event["type"] = "charge.refunded"
        self.assertEqual(self.post(event).status_code, 200)
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "open")


@override_settings(DEBUG=True)
class TestInvoiceCommandTests(TestCase):
    def test_creates_three_and_can_run_twice(self):
        call_command("create_test_invoices")
        call_command("create_test_invoices")
        self.assertEqual(PaymentInvoice.objects.count(), 3)

    @override_settings(DEBUG=False)
    def test_refuses_in_production(self):
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            call_command("create_test_invoices")
