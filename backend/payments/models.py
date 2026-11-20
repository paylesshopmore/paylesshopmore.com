"""The invoices a customer can pay online.

This is deliberately NOT invoicing.Invoice. That model is the office's full
invoice (lines, PDF, review steps). This one is the small record the payment
page needs: "invoice number X is for this many cents, and is it paid yet?".
The office creates one here for each invoice it wants paid online.
"""

import re

from django.core.validators import RegexValidator
from django.db import models

# What a number looks like: PLSM- followed by 4 to 8 digits, e.g. PLSM-10231.
# The PLSM- prefix is on purpose: it tells a customer at a glance that the
# invoice came from us, and lets us refuse anything that did not.
NUMBER_PATTERN = r"^PLSM-\d{4,8}$"
NUMBER_RE = re.compile(NUMBER_PATTERN)


class PaymentInvoice(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        PAID = "paid", "Paid"

    number = models.CharField(
        max_length=20,
        unique=True,
        validators=[
            RegexValidator(NUMBER_PATTERN, "Use the format PLSM- followed by 4 to 8 digits.")
        ],
        help_text="As printed on the invoice we sent, e.g. PLSM-10231.",
    )
    # Money as whole cents, never a float: 12.50 euro is 1250. Floats cannot
    # hold most decimal amounts exactly, and Stripe wants cents anyway.
    amount = models.PositiveIntegerField(help_text="In cents. 12.50 euro is 1250.")
    currency = models.CharField(max_length=3, default="eur")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    # Which Stripe checkout paid it, so the office can find the payment in
    # the Stripe dashboard.
    stripe_session_id = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.number} ({self.get_status_display()})"
