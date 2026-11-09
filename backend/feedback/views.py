"""Feedback endpoints.

    POST /api/feedback/                  anybody: the "Feedback" button
    GET  /api/feedback/deliveries/       signed in: my delivered shipments,
                                         each with my review or null
    POST /api/feedback/deliveries/       signed in: review one of them
    /api/staff/feedback/                 the office: list, mark handled
"""

import logging

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.models import Package
from config import abuse
from staff.views import StaffViewSet

from .models import Feedback
from .serializers import DeliveryReviewSerializer, SiteFeedbackSerializer, StaffFeedbackSerializer

# How many delivered shipments the profile lists (newest first).
DELIVERIES_SHOWN = 10

logger = logging.getLogger(__name__)


def email_office_when_saved(feedback_id):
    """Queue the office e-mail once the feedback is really saved.

    A failure to queue is logged and swallowed: the feedback is saved and in
    the dashboard either way - only the e-mail about it is missing.
    """

    def send():
        from .tasks import send_feedback_email

        try:
            send_feedback_email.delay(feedback_id)
        except Exception:
            logger.exception("Feedback %s was saved but its e-mail could not be queued.", feedback_id)

    transaction.on_commit(send)


class SiteFeedbackView(APIView):
    """POST: the "Feedback" button. Open to everybody, throttled like the
    contact form, and write-only - nothing is echoed back."""

    permission_classes = [AllowAny]
    throttle_scope = "forms"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        # A site-wide ceiling as well as the per-address throttle (config/abuse.py).
        abuse.check("feedback")
        serializer = SiteFeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = request.user if request.user.is_authenticated else None
        feedback = Feedback.objects.create(
            kind=Feedback.Kind.SITE,
            rating=data["rating"],
            comment=data.get("comment", ""),
            # Signed in: their account says who it is; no address needed.
            email="" if user else data.get("email", ""),
            page=data.get("page", ""),
            language=data.get("language", ""),
            user=user,
        )
        abuse.record("feedback")
        email_office_when_saved(feedback.pk)
        return Response(status=status.HTTP_201_CREATED)


class DeliveryReviewView(APIView):
    """GET my delivered shipments with my reviews; POST a review of one."""

    permission_classes = [IsAuthenticated]
    throttle_scope = "forms"

    def get_throttles(self):
        # Reading the list is not throttled; sending a review is.
        return [ScopedRateThrottle()] if self.request.method == "POST" else []

    def get(self, request):
        packages = (
            Package.objects.filter(user=request.user, status=Package.Status.DELIVERED)
            .order_by("-delivered_at", "-pk")[:DELIVERIES_SHOWN]
        )
        reviews = {
            review.package_id: review
            for review in Feedback.objects.filter(
                kind=Feedback.Kind.DELIVERY, package__in=packages
            )
        }
        return Response(
            [
                {
                    "package": package.pk,
                    "tracking_number": package.tracking_number,
                    "delivered_at": package.delivered_at,
                    "review": (
                        {"rating": reviews[package.pk].rating, "comment": reviews[package.pk].comment}
                        if package.pk in reviews
                        else None
                    ),
                }
                for package in packages
            ]
        )

    def post(self, request):
        serializer = DeliveryReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Only the customer's own shipment, and only once it is delivered.
        # Somebody else's id answers exactly like one that does not exist.
        package = Package.objects.filter(pk=data["package"], user=request.user).first()
        if package is None:
            raise NotFound("That shipment was not found.")
        if package.status != Package.Status.DELIVERED:
            raise ValidationError({"package": ["You can review a shipment once it has been delivered."]})

        try:
            with transaction.atomic():
                review = Feedback.objects.create(
                    kind=Feedback.Kind.DELIVERY,
                    rating=data["rating"],
                    comment=data.get("comment", ""),
                    user=request.user,
                    package=package,
                    language=getattr(request.user, "language", "") or "",
                )
        except IntegrityError:
            # The database's one-review-per-shipment rule.
            return Response(
                {"detail": "You have already reviewed this shipment. Thank you!"},
                status=status.HTTP_409_CONFLICT,
            )
        email_office_when_saved(review.pk)
        return Response(status=status.HTTP_201_CREATED)


class StaffFeedbackViewSet(StaffViewSet):
    """Dashboard -> Feedback: read everything, mark it handled. Office only.

    Filters: ?kind=site|delivery, ?rating=1..5, ?handled=true|false,
    ?search= (comment, e-mail, customer, tracking number).
    """

    serializer_class = StaffFeedbackSerializer
    queryset = Feedback.objects.select_related("user", "package", "handled_by")
    filter_fields = ("kind", "rating")
    search_fields = (
        "comment",
        "email",
        "user__email",
        "user__first_name",
        "user__last_name",
        "package__tracking_number",
    )
    ordering_fields = ("created_at", "rating")

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        handled = self.request.query_params.get("handled")
        if handled == "true":
            queryset = queryset.filter(handled_at__isnull=False)
        elif handled == "false":
            queryset = queryset.filter(handled_at__isnull=True)
        return queryset

    def perform_update(self, serializer):
        # "handled": true stamps who and when; false clears it.
        handled = serializer.validated_data.pop("handled", None)
        extra = {}
        if handled is True and serializer.instance.handled_at is None:
            extra = {"handled_at": timezone.now(), "handled_by": self.request.user}
        elif handled is False:
            extra = {"handled_at": None, "handled_by": None}
        serializer.save(**extra)
