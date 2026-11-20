"""Paying an invoice online with Stripe Checkout.

Two endpoints, and they split the work on purpose:

  POST /api/payments/checkout/  the customer's browser asks "let me pay
                                invoice X"; we answer with a Stripe address.
  POST /api/payments/webhook/   Stripe tells US that a payment went through.

An invoice is only ever marked paid by the second one. The page the customer
lands on afterwards is just a thank-you note: anyone can type its address, so
it proves nothing.
"""

import logging

import stripe
from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import PaymentInvoice
from .serializers import CheckoutSerializer

logger = logging.getLogger(__name__)

# One answer for "no such invoice" AND "already paid" AND "badly typed", so
# nobody can use this endpoint to find out which invoice numbers exist.
NOT_AVAILABLE = {
    "code": "INVOICE_UNAVAILABLE",
    "detail": "We could not find an open invoice with that number.",
}
UNAVAILABLE = {
    "code": "UNAVAILABLE",
    "detail": "Online payment is not available right now.",
}


class CheckoutView(APIView):
    permission_classes = [AllowAny]  # customers do not need an account to pay
    # Slows down anyone trying number after number (see settings:
    # payment_checkout).
    throttle_scope = "payment_checkout"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(NOT_AVAILABLE, status=status.HTTP_404_NOT_FOUND)

        if not settings.STRIPE_SECRET_KEY:
            logger.error("STRIPE_SECRET_KEY is not set; cannot create a checkout.")
            return Response(UNAVAILABLE, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        invoice = PaymentInvoice.objects.filter(
            number=serializer.validated_data["number"],
            status=PaymentInvoice.Status.OPEN,
        ).first()
        if invoice is None:
            return Response(NOT_AVAILABLE, status=status.HTTP_404_NOT_FOUND)

        try:
            session = stripe.checkout.Session.create(
                api_key=settings.STRIPE_SECRET_KEY,
                mode="payment",
                client_reference_id=str(invoice.pk),
                line_items=[
                    {
                        "quantity": 1,
                        "price_data": {
                            # The amount is OURS, from the database.
                            "currency": invoice.currency,
                            "unit_amount": invoice.amount,
                            "product_data": {"name": f"Invoice {invoice.number}"},
                        },
                    }
                ],
                # The webhook reads this to know which invoice was paid.
                metadata={"invoice_id": str(invoice.pk), "invoice_number": invoice.number},
                success_url=f"{settings.FRONTEND_URL}/pay/success",
                cancel_url=f"{settings.FRONTEND_URL}/pay?cancelled=1",
            )
        except stripe.StripeError:
            # The detail goes to our log; the customer gets nothing technical.
            logger.exception("Stripe refused to create a checkout for %s", invoice.number)
            return Response(UNAVAILABLE, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({"url": session.url})


# Stripe is not a browser and has no CSRF token; the signature check below is
# the proof it is really Stripe, so CSRF is switched off for this one view.
@csrf_exempt
@require_POST
def webhook(request):
    if not settings.STRIPE_WEBHOOK_SECRET:
        logger.error("STRIPE_WEBHOOK_SECRET is not set; rejecting webhook.")
        return HttpResponse(status=503)

    try:
        # Checks the signature against the RAW body. Anything not sent by
        # Stripe (or altered on the way) fails here.
        event = stripe.Webhook.construct_event(
            request.body,
            request.META.get("HTTP_STRIPE_SIGNATURE", ""),
            settings.STRIPE_WEBHOOK_SECRET,
        )
    except (ValueError, stripe.SignatureVerificationError):
        return HttpResponse(status=400)

    # "async_payment_succeeded" is for methods that confirm a little later.
    if event["type"] in (
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
    ):
        mark_paid(event["data"]["object"])

    # 200 for events we do not care about too, or Stripe keeps retrying them.
    return HttpResponse(status=200)


def mark_paid(session):
    # "completed" can also mean "the customer started a delayed payment";
    # only act when the money has actually arrived.
    if session.get("payment_status") != "paid":
        return

    invoice_id = (session.get("metadata") or {}).get("invoice_id")
    if not invoice_id:
        return

    # The lock makes two copies of the same event take turns: the second one
    # waits, then sees "paid" and does nothing.
    with transaction.atomic():
        invoice = PaymentInvoice.objects.select_for_update().filter(pk=invoice_id).first()
        if invoice is None or invoice.status == PaymentInvoice.Status.PAID:
            return

        # Belt and braces: what was paid must be what we asked for.
        if (
            session.get("amount_total") != invoice.amount
            or (session.get("currency") or "").lower() != invoice.currency
        ):
            logger.error(
                "Payment for %s does not match the invoice; not marking paid.", invoice.number
            )
            return

        invoice.status = PaymentInvoice.Status.PAID
        invoice.paid_at = timezone.now()
        invoice.stripe_session_id = session.get("id", "")
        invoice.save(update_fields=["status", "paid_at", "stripe_session_id"])
