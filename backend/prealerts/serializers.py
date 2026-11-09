"""Pre-alerts as JSON, and checking what a customer sends.

CustomerPreAlertSerializer   the customer's own pre-alert, as they read it
StaffPreAlertSerializer      the same plus who it belongs to, for the office
PreAlertInputSerializer      the form a customer sends (checked here, saved
                             by views.create_prealert)

Every field is listed by hand, so a new model column is never published by
accident. Files are never linked by their storage path: each has a
`url` pointing at a view that checks who is asking.
"""

from decimal import Decimal

from django.urls import reverse
from rest_framework import serializers

from bookings.serializers import validate_attachment
from shops.models import Shop
from tracking.models import Carrier
from tracking.normalize import InvalidTrackingNumber, normalize_tracking_number
from tracking.serializers import CustomerShipmentSerializer

from .models import PreAlert, PreAlertDocument

# What the form may carry. The same file types and size as the booking
# form's screenshots (bookings.serializers.validate_attachment): PNG, JPG,
# WebP or PDF, 10 MB each, checked by their contents and not only their name.
MAX_DESCRIPTION = 500


class DocumentSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()

    class Meta:
        model = PreAlertDocument
        fields = ["id", "name", "content_type", "size_bytes", "url"]
        read_only_fields = fields

    def get_name(self, document):
        return str(document)

    def get_url(self, document):
        route = self.context.get("document_route", "prealert-document")
        return reverse(route, args=[document.prealert_id, document.pk])


class CustomerPreAlertSerializer(serializers.ModelSerializer):
    carrier = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    documents = serializers.SerializerMethodField()
    # Where the courier has it now (tracking app), or null.
    carrier_tracking = serializers.SerializerMethodField()
    package_tracking_number = serializers.SerializerMethodField()
    can_cancel = serializers.BooleanField(read_only=True)

    class Meta:
        model = PreAlert
        fields = [
            "id",
            "reference",
            "tracking_number",
            "carrier",
            "shop_name",
            "description",
            "consignee_name",
            "consignee_address_text",
            "declared_value",
            "currency",
            "status",
            "status_display",
            "arrived_at",
            "package_tracking_number",
            "documents",
            "carrier_tracking",
            "can_cancel",
            "created_at",
        ]
        read_only_fields = fields

    def get_carrier(self, prealert):
        return {"code": prealert.carrier.code, "name": prealert.carrier.name}

    def get_documents(self, prealert):
        return DocumentSerializer(prealert.documents.all(), many=True, context=self.context).data

    def get_carrier_tracking(self, prealert):
        shipment = getattr(prealert, "carrier_shipment", None)
        return CustomerShipmentSerializer(shipment).data if shipment else None

    def get_package_tracking_number(self, prealert):
        return prealert.package.tracking_number if prealert.package_id else None


class StaffPreAlertSerializer(CustomerPreAlertSerializer):
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.SerializerMethodField()
    arrived_by_name = serializers.SerializerMethodField()

    class Meta(CustomerPreAlertSerializer.Meta):
        fields = CustomerPreAlertSerializer.Meta.fields + [
            "customer_name",
            "customer_email",
            "restricted_items_confirmed_at",
            "arrived_by_name",
            "updated_at",
        ]
        read_only_fields = fields

    def get_customer_name(self, prealert):
        return str(prealert.user) if prealert.user_id else None

    def get_customer_email(self, prealert):
        return prealert.user.email if prealert.user_id else None

    def get_arrived_by_name(self, prealert):
        return str(prealert.arrived_by) if prealert.arrived_by_id else None


class PreAlertInputSerializer(serializers.Serializer):
    """The pre-alert form, field by field. Files come separately (request.FILES)."""

    tracking_number = serializers.CharField(max_length=255)
    carrier = serializers.SlugRelatedField(
        slug_field="code", queryset=Carrier.objects.filter(is_active=True)
    )
    # A shop from our list, or "other" with its name typed.
    shop = serializers.PrimaryKeyRelatedField(
        queryset=Shop.objects.filter(is_active=True), required=False, allow_null=True
    )
    shop_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    description = serializers.CharField(max_length=MAX_DESCRIPTION)
    consignee_name = serializers.CharField(max_length=150)
    # One of the customer's own addresses (checked in validate), optional.
    consignee_address = serializers.IntegerField(required=False, allow_null=True)
    # Or: deliver to the PayLesShopMore address itself (the company address in
    # Site settings), instead of one of the customer's own addresses.
    deliver_to_company = serializers.BooleanField(required=False, default=False)
    # Optional: the form no longer asks for it. Left out means "not given".
    declared_value = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal("0.01"), required=False, allow_null=True
    )
    currency = serializers.ChoiceField(choices=PreAlert.Currency.choices, default=PreAlert.Currency.EUR)
    # Must be ticked: "I have read the list of restricted items".
    restricted_items_confirmed = serializers.BooleanField()

    def validate_tracking_number(self, value):
        try:
            return normalize_tracking_number(value)
        except InvalidTrackingNumber as error:
            raise serializers.ValidationError(str(error)) from None

    def validate_description(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("Say what is in the package.")
        return value

    def validate_consignee_name(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("Enter who receives the package.")
        return value

    def validate_restricted_items_confirmed(self, value):
        if value is not True:
            raise serializers.ValidationError(
                "Confirm that you have read the list of restricted items."
            )
        return value

    def validate(self, attrs):
        shop = attrs.get("shop")
        name = (attrs.get("shop_name") or "").strip()
        if shop is None and not name:
            raise serializers.ValidationError({"shop": "Choose the shop, or type its name."})
        # The listed shop's own name wins over anything typed alongside it.
        attrs["shop_name"] = shop.name if shop else name

        if not attrs["carrier"].trackable:
            # "Walk-in" has no courier number to follow: that is a booking.
            raise serializers.ValidationError(
                {"carrier": "A pre-alert is for a parcel sent by a courier. Choose the courier."}
            )

        address_id = attrs.pop("consignee_address", None)
        attrs["consignee_address"] = None
        # The written-down address kept with the pre-alert (views.py).
        attrs["consignee_address_text"] = ""
        if attrs.pop("deliver_to_company", False):
            # The PayLesShopMore address: no customer address is linked.
            attrs["consignee_address_text"] = company_address_text()
            return attrs
        if address_id:
            user = self.context["request"].user
            # Only one of the caller's own addresses: somebody else's id is
            # refused exactly like one that does not exist.
            address = user.addresses.filter(pk=address_id).first()
            if address is None:
                raise serializers.ValidationError({"consignee_address": "Choose one of your addresses."})
            attrs["consignee_address"] = address
            attrs["consignee_address_text"] = address_text(address)
        return attrs


def validate_documents(files):
    """Check the uploaded invoice files; return [(file, content_type), ...]."""
    if len(files) > PreAlertDocument.MAX_PER_PREALERT:
        raise serializers.ValidationError(
            {"documents": f"At most {PreAlertDocument.MAX_PER_PREALERT} files."}
        )
    checked = []
    for uploaded in files:
        try:
            checked.append((uploaded, validate_attachment(uploaded)))
        except serializers.ValidationError as error:
            raise serializers.ValidationError({"documents": error.detail}) from None
    return checked


def company_address_text():
    """The PayLesShopMore address (Django admin -> Site settings), as lines."""
    from accounts.models import SiteSettings

    settings_row = SiteSettings.load()
    lines = [
        settings_row.company_name,
        settings_row.company_street,
        settings_row.company_postcode_city,
        "Nederland",
    ]
    return "\n".join(line.strip() for line in lines if line and line.strip())


def address_text(address):
    """An address as the lines it is written in, for the snapshot."""
    if address is None:
        return ""
    lines = [f"{address.street} {address.house_number}".strip(),
             f"{address.postal_code} {address.city}".strip(),
             address.get_country_display()]
    return "\n".join(line for line in lines if line)
