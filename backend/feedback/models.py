"""Feedback from customers and visitors.

Two kinds, in one table so the office reads them in one list:

* SITE      the "Feedback" button on every page of the website. Anybody may
            send it, signed in or not: stars (1-5) and a comment, plus which
            page they were on.
* DELIVERY  a review of one delivered shipment, by the customer it belongs
            to. Asked for in the "delivered" e-mail and on the profile page.
            One review per shipment.

The office marks feedback as handled (with an optional note) in the dashboard
(Dashboard -> Feedback). Nothing is ever deleted from there.
"""

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

MAX_COMMENT = 2000


class Feedback(models.Model):
    class Kind(models.TextChoices):
        SITE = "site", "Website feedback"
        DELIVERY = "delivery", "Delivery review"

    kind = models.CharField(max_length=10, choices=Kind.choices)
    # 1 (bad) to 5 (very good).
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField(blank=True, max_length=MAX_COMMENT)

    # Who sent it: the account when signed in. SET_NULL so the feedback stays
    # when an account is deleted.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="feedback",
    )
    # A visitor who is not signed in may leave an address for an answer.
    email = models.EmailField(blank=True)
    # The page they were on ("/booking"), for website feedback.
    page = models.CharField(max_length=200, blank=True)
    # The language they read the site in (nl / en / pap).
    language = models.CharField(max_length=5, blank=True)

    # The shipment a delivery review is about.
    package = models.ForeignKey(
        "accounts.Package",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviews",
    )

    # The office: read and dealt with.
    handled_at = models.DateTimeField(null=True, blank=True)
    handled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    staff_note = models.CharField(max_length=500, blank=True)

    # When the office was e-mailed about it (feedback/tasks.py). Set once,
    # so a retried job never sends the same feedback twice.
    office_emailed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "feedback"
        verbose_name_plural = "feedback"
        constraints = [
            # One review per shipment - the database refuses a second.
            models.UniqueConstraint(
                fields=["package"],
                condition=Q(kind="delivery"),
                name="feedback_one_review_per_package",
            ),
        ]
        indexes = [models.Index(fields=["kind", "-created_at"])]

    def __str__(self):
        return f"{self.get_kind_display()}: {self.rating}/5"
