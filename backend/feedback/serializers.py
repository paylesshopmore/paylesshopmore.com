"""What the feedback endpoints accept and answer. See views.py."""

from rest_framework import serializers

from .models import MAX_COMMENT, Feedback

LANGUAGES = ("nl", "en", "pap")


def _clean_comment(value):
    # Runs of spaces and blank lines folded, ends trimmed.
    return "\n".join(" ".join(line.split()) for line in value.strip().splitlines()).strip()


class SiteFeedbackSerializer(serializers.Serializer):
    """POST /api/feedback/ - the button on every page."""

    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(max_length=MAX_COMMENT, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    page = serializers.CharField(max_length=200, required=False, allow_blank=True)
    language = serializers.CharField(max_length=5, required=False, allow_blank=True)

    def validate_comment(self, value):
        return _clean_comment(value)

    def validate_page(self, value):
        # Only a path on our own site ("/booking"), never a full address.
        value = value.strip()
        return value if value.startswith("/") else ""

    def validate_language(self, value):
        return value if value in LANGUAGES else ""


class DeliveryReviewSerializer(serializers.Serializer):
    """POST /api/feedback/deliveries/ - a review of one delivered shipment."""

    package = serializers.IntegerField()
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(max_length=MAX_COMMENT, required=False, allow_blank=True)

    def validate_comment(self, value):
        return _clean_comment(value)


class StaffFeedbackSerializer(serializers.ModelSerializer):
    """One row in Dashboard -> Feedback. Only the handling can be changed."""

    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    customer = serializers.SerializerMethodField()
    package_tracking = serializers.CharField(source="package.tracking_number", read_only=True, default="")
    handled_by_name = serializers.SerializerMethodField()
    # Sent as true / false; the server stamps who and when.
    handled = serializers.BooleanField(required=False, write_only=True)

    class Meta:
        model = Feedback
        fields = [
            "id",
            "kind",
            "kind_display",
            "rating",
            "comment",
            "customer",
            "email",
            "page",
            "language",
            "package",
            "package_tracking",
            "handled",
            "handled_at",
            "handled_by_name",
            "staff_note",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "kind",
            "rating",
            "comment",
            "email",
            "page",
            "language",
            "package",
            "handled_at",
            "created_at",
        ]

    def get_customer(self, obj):
        user = obj.user
        if user is None:
            return None
        return {
            "id": user.pk,
            "name": user.get_full_name() or user.email,
            "email": user.email,
            "customer_code": getattr(user, "customer_code", "") or "",
        }

    def get_handled_by_name(self, obj):
        user = obj.handled_by
        return (user.get_full_name() or user.email) if user else ""
