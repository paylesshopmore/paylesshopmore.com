"""Two views of a booking: the customer's half, and the office's whole.

The split is the point. BookingSerializer accepts exactly the fields a sender
fills in — so a crafted request cannot set its own shipping number, weigh its
own consignment, or mark its own packing as good.
"""

import os

from django.core.exceptions import ValidationError as DjangoValidationError
from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers

from shops.models import Shop

from .models import (
    Booking,
    BookingAttachment,
    BookingOrder,
    BookingProduct,
    validate_product_url,
)
from .shipments import ready_to_invoice, why_no_shipment


def handling_for(booking):
    """The booking's handling costs, from the one price list
    (invoicing/calculation.py HANDLING_FEE_RULES), or None without a value.

    The purchase value is the booking's value (`value_eur`, which the office
    fills in from the order screenshots), else what the customer's products
    add up to. The suppliers are the stores on the booking form. Worked out
    on the server every time it is read, so the customer and the office see
    the same figure and no browser can send its own.
    """
    from invoicing.calculation import handling_fee, handling_fee_as_json

    orders = list(booking.orders.all())
    value = booking.value_eur
    if value is None:
        priced = [
            product.customer_subtotal_eur
            for order in orders
            for product in order.products.all()
            if product.customer_price_eur is not None
        ]
        value = sum(priced) if priced else None
    result = handling_fee(value, suppliers=len(orders) or None)
    if result is not None:
        result["value_source"] = "booking" if booking.value_eur is not None else "products"
    return handling_fee_as_json(result)


def validate_attachment(uploaded):
    """Check one uploaded screenshot or photo; return its content type.

    The same checks as a customer's receipt upload (accounts PackageDocument):
    not empty, not too big, an allowed extension, and contents that really
    are that type. Raises serializers.ValidationError with a sentence the
    form can show."""
    name = uploaded.name or ""
    if uploaded.size == 0:
        raise serializers.ValidationError(f"{name} is empty.")

    if uploaded.size > BookingAttachment.MAX_BYTES:
        megabytes = BookingAttachment.MAX_BYTES // (1024 * 1024)
        raise serializers.ValidationError(f"{name} is larger than {megabytes} MB.")

    extension = os.path.splitext(name)[1].lower()
    signatures = BookingAttachment.SIGNATURES.get(extension)
    if signatures is None:
        raise serializers.ValidationError(
            f"{name}: only a PNG, JPG, WebP or PDF can be added."
        )

    head = uploaded.read(12)
    # Rewound, or the stored copy would start part-way in.
    uploaded.seek(0)
    matches = any(head.startswith(signature) for signature in signatures)
    if extension == ".webp":
        matches = matches and head[8:12] == b"WEBP"
    if not matches:
        raise serializers.ValidationError(
            f"{name} is named {extension} but is not one."
        )

    return BookingAttachment.CONTENT_TYPES[extension]


class ProductInputSerializer(serializers.Serializer):
    """One product under a store, as the booking form sends it: what it is,
    the link to it on the webshop, the price paid and how many. Its
    screenshot comes separately, as a file."""

    description = serializers.CharField(max_length=255)
    url = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    customer_price_eur = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=0,
        max_value=1_000_000,
        required=False,
        allow_null=True,
    )
    quantity = serializers.IntegerField(min_value=1, max_value=999, required=False, default=1)

    def validate_url(self, value):
        value = (value or "").strip()
        if not value:
            return ""
        try:
            validate_product_url(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages) from None
        return value


class OrderInputSerializer(serializers.Serializer):
    """One store row as the booking form sends it: a store from the list
    (`shop`, its id) or another store by name (`shop_name`), what was bought
    there, and - from the newer form - the products one by one. The
    screenshots come separately, as files.

    `description` may be left out when there are products: it is then their
    descriptions joined, so the store row (and the contents line customs
    reads) still says what was bought. An older form that sends only
    `description` works as before."""

    shop = serializers.PrimaryKeyRelatedField(
        queryset=Shop.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    shop_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)
    products = ProductInputSerializer(many=True, required=False)

    def validate_products(self, value):
        if len(value) > BookingProduct.MAX_PER_ORDER:
            raise serializers.ValidationError(
                f"At most {BookingProduct.MAX_PER_ORDER} products can be added to one store."
            )
        return value

    def validate(self, attrs):
        shop = attrs.get("shop")
        name = (attrs.get("shop_name") or "").strip()
        if shop is None and not name:
            raise serializers.ValidationError({"shop": "Choose a store, or type its name."})
        # The listed store's own name wins over anything typed alongside it.
        attrs["shop_name"] = shop.name if shop else name

        products = attrs.get("products") or []
        description = (attrs.get("description") or "").strip()
        if not description and products:
            description = "; ".join(product["description"] for product in products)
            if len(description) > 255:
                description = description[:254] + "…"
        if not description:
            raise serializers.ValidationError({"description": "Fill in what you ordered."})
        attrs["description"] = description
        attrs["products"] = products
        return attrs


def contents_from(orders):
    """The one line customs and the office read: "bol.com: laptop; IKEA: kast"."""
    return "; ".join(f"{order['shop_name']}: {order['description']}" for order in orders)


class _AttachmentSerializer(serializers.ModelSerializer):
    """One attachment as listed with its booking. `url` is filled in by the
    two subclasses: each audience fetches the file through its own checked
    route, never straight from the media folder."""

    name = serializers.CharField(source="original_name")
    size = serializers.IntegerField(source="size_bytes")
    is_image = serializers.BooleanField(read_only=True)
    url = serializers.SerializerMethodField()

    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = BookingAttachment
        fields = [
            "id",
            "name",
            "content_type",
            "size",
            "is_image",
            "kind",
            "kind_display",
            "created_at",
            "url",
        ]
        read_only_fields = fields


class MyAttachmentSerializer(_AttachmentSerializer):
    def get_url(self, attachment):
        return reverse("my-booking-attachment", args=[attachment.booking_id, attachment.pk])


class StaffAttachmentSerializer(_AttachmentSerializer):
    def get_url(self, attachment):
        return reverse(
            "staff-booking-attachment", args=[attachment.booking_id, attachment.pk]
        )


class _ProductSerializer(serializers.ModelSerializer):
    """One product as the customer reported it. The subclasses choose whose
    download route its screenshot links to; the office's adds its own half
    (the checked price, the status, the internal notes)."""

    attachment_serializer = None
    customer_subtotal_eur = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    screenshot = serializers.SerializerMethodField()

    class Meta:
        model = BookingProduct
        fields = [
            "id",
            "description",
            "url",
            "customer_price_eur",
            "quantity",
            "customer_subtotal_eur",
            "screenshot",
        ]
        read_only_fields = fields

    def get_screenshot(self, product):
        shot = product.screenshot
        return self.attachment_serializer(shot).data if shot else None


class MyProductSerializer(_ProductSerializer):
    """The customer's own products: what they told us, and nothing the office
    wrote about them - no checked price, no status, no notes."""

    attachment_serializer = MyAttachmentSerializer


class StaffProductSerializer(_ProductSerializer):
    """The office's view: the customer's figures and the check beside them."""

    attachment_serializer = StaffAttachmentSerializer
    store_name = serializers.CharField(read_only=True)
    verification_status_display = serializers.CharField(
        source="get_verification_status_display", read_only=True
    )
    verified_by_name = serializers.SerializerMethodField()

    class Meta(_ProductSerializer.Meta):
        fields = [
            *_ProductSerializer.Meta.fields,
            "store_name",
            "verified_price_eur",
            "verification_status",
            "verification_status_display",
            "staff_notes",
            "verified_by_name",
            "verified_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_verified_by_name(self, product):
        user = product.verified_by
        return (user.get_full_name() or user.get_username()) if user else ""


class StaffProductCheckSerializer(serializers.ModelSerializer):
    """What the office may change on a product: its own half only. The
    customer's description, link, price and quantity are not writable here -
    the reported price is never replaced, only checked beside."""

    class Meta:
        model = BookingProduct
        fields = ["verified_price_eur", "verification_status", "staff_notes"]
        extra_kwargs = {"staff_notes": {"max_length": 2000}}


class _OrderSerializer(serializers.ModelSerializer):
    """One store row as read back, with its screenshot (or null). The
    subclasses choose whose download route the screenshot links to."""

    attachment_serializer = None
    screenshot = serializers.SerializerMethodField()
    # Added afterwards: order confirmation, invoice, track-and-trace, other.
    documents = serializers.SerializerMethodField()
    # The courier following this order to our warehouse (tracking app), or
    # null when the customer has not given a courier tracking number yet.
    # The courier number the customer entered on this order (what the form
    # edits), and every courier shipment of the order - an order can arrive in
    # several parcels, and staff can register numbers on it too.
    carrier_tracking = serializers.SerializerMethodField()
    carrier_trackings = serializers.SerializerMethodField()
    # The products one by one, with their links and prices; empty for a
    # booking sent before products were asked for.
    product_serializer = None
    products = serializers.SerializerMethodField()
    products_subtotal_eur = serializers.SerializerMethodField()

    class Meta:
        model = BookingOrder
        fields = [
            "id",
            "shop",
            "shop_name",
            "description",
            "tracking_code",
            "screenshot",
            "documents",
            "carrier_tracking",
            "carrier_trackings",
            "products",
            "products_subtotal_eur",
        ]
        read_only_fields = fields

    def get_products(self, order):
        return self.product_serializer(order.products.all(), many=True).data

    def get_products_subtotal_eur(self, order):
        """The customer's prices × quantities added up; null when no product has a price."""
        priced = [
            product.customer_subtotal_eur
            for product in order.products.all()
            if product.customer_price_eur is not None
        ]
        return str(sum(priced)) if priced else None

    def _files(self, order):
        # .all(), so a prefetch is used. `screenshots` is the related name of
        # every file on the row, whatever its kind.
        return list(order.screenshots.all())

    def get_screenshot(self, order):
        shots = [f for f in self._files(order) if f.kind == BookingAttachment.Kind.SCREENSHOT]
        return self.attachment_serializer(shots[0]).data if shots else None

    def get_documents(self, order):
        docs = [f for f in self._files(order) if f.kind not in BookingAttachment.FORM_KINDS]
        return self.attachment_serializer(docs, many=True).data

    def get_carrier_tracking(self, order):
        # Imported here: the tracking app imports bookings, not the other way round.
        from tracking.serializers import CustomerShipmentSerializer

        shipment = next((s for s in order.carrier_shipments.all() if s.entered_by_customer), None)
        return CustomerShipmentSerializer(shipment).data if shipment else None

    def get_carrier_trackings(self, order):
        from tracking.serializers import CustomerShipmentSerializer

        return CustomerShipmentSerializer(order.carrier_shipments.all(), many=True).data


class MyOrderSerializer(_OrderSerializer):
    attachment_serializer = MyAttachmentSerializer
    product_serializer = MyProductSerializer


class StaffOrderSerializer(_OrderSerializer):
    attachment_serializer = StaffAttachmentSerializer
    product_serializer = StaffProductSerializer

# What the sender fills in. Listed by hand: built from `exclude`, this would
# start accepting `status` the day somebody added a field to the model.
SENDER_FIELDS = [
    "freight",
    "destination",
    "destination_other",
    "sender_first_name",
    "sender_last_name",
    "sender_address",
    "sender_postal_code",
    "sender_city",
    "sender_phone",
    "sender_email",
    "recipient_first_name",
    "recipient_last_name",
    "recipient_address",
    "recipient_city",
    "recipient_phone",
    "recipient_email",
    "recipient_crib_number",
    "packing",
    "payment",
    "quantity",
    "unit",
    "contents",
    "contents_attached",
    "value_eur",
    "vehicle",
    "emigration",
    "id_present",
    "deregistered",
    "deregistration_present",
    "insured",
    "insured_value_eur",
    "notes",
    "signature_name",
    "agreed_terms",
    "language",
]

# Fields the sender may give that the office may also set or correct. The
# value: the form no longer asks for it, so the office fills it in from the
# customer's screenshots.
OFFICE_EDITABLE = ["value_eur"]

# What only the counter fills in.
OFFICE_FIELDS = [
    "shipping_number",
    "status",
    "volume_m3",
    "weight_kg",
    "packing_quality",
    "office_notes",
]


class BookingSerializer(serializers.ModelSerializer):
    """The public form. Write-only: bookings are read back only through
    MyBookingSerializer, by their own customer, so a bug here cannot leak
    one."""

    class Meta:
        model = Booking
        fields = SENDER_FIELDS
        extra_kwargs = {
            "contents": {"required": False, "allow_blank": True},
            "notes": {"required": False, "allow_blank": True},
            "recipient_email": {"required": False, "allow_blank": True},
            "recipient_crib_number": {"required": False, "allow_blank": True},
            # Left out when the sender cannot know it yet; see the model.
            "quantity": {"required": False, "allow_null": True},
            "destination_other": {"required": False, "allow_blank": True},
            "language": {"required": False, "allow_blank": True},
        }

    def validate_agreed_terms(self, value):
        """The whole form is an agreement; without this it is just a list."""
        if not value:
            raise serializers.ValidationError(
                "The terms and conditions have to be accepted to place a booking."
            )
        return value

    def validate_signature_name(self, value):
        name = value.strip()
        if len(name) < 3:
            raise serializers.ValidationError("Please type your full name to sign.")
        return name

    def validate_value_eur(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("The value cannot be negative.")
        return value

    def validate(self, attrs):
        errors = {}

        # "Overig" is only a destination once it says where.
        if attrs.get("destination") == Booking.Destination.OTHER:
            if not attrs.get("destination_other", "").strip():
                errors["destination_other"] = "Please say which destination."
        else:
            attrs["destination_other"] = ""

        # An insured shipment needs a figure to insure; an uninsured one must
        # not carry a stale one from a half-filled form.
        if attrs.get("insured"):
            if attrs.get("insured_value_eur") in (None, ""):
                errors["insured_value_eur"] = "Please give the value to insure."
        else:
            attrs["insured_value_eur"] = None

        # The four emigration boxes only mean anything alongside an emigration,
        # so they are cleared rather than stored as stray yeses.
        if not attrs.get("emigration"):
            attrs["id_present"] = False
            attrs["deregistered"] = False
            attrs["deregistration_present"] = False

        # Nothing to describe the consignment by is not a booking anyone can
        # act on: either a list, or a note that one is coming separately.
        if not attrs.get("contents", "").strip() and not attrs.get("contents_attached"):
            errors["contents"] = (
                "Describe the contents, or tick that a list follows separately."
            )

        if errors:
            raise serializers.ValidationError(errors)

        return attrs

    def create(self, validated_data):
        # Stamped by the server, not sent by the browser: the time a signature
        # was given is not something the signer gets to choose.
        validated_data["signed_at"] = timezone.now()
        return super().create(validated_data)


class StaffBookingSerializer(serializers.ModelSerializer):
    """The whole form, for the dashboard.

    Only the office half is writable. What the sender put on the form is a
    record of what they declared — the value especially, which customs uses to
    charge duty — and is not the office's to edit afterwards.
    """

    destination_label = serializers.CharField(read_only=True)
    sender_name = serializers.CharField(read_only=True)
    recipient_name = serializers.CharField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    freight_display = serializers.CharField(source="get_freight_display", read_only=True)
    packing_display = serializers.CharField(source="get_packing_display", read_only=True)
    payment_display = serializers.CharField(source="get_payment_display", read_only=True)
    unit_display = serializers.CharField(source="get_unit_display", read_only=True)
    vehicle_display = serializers.CharField(source="get_vehicle_display", read_only=True)
    # The stores the customer bought from, each with its screenshot -
    # read-only like everything else they sent.
    orders = StaffOrderSerializer(many=True, read_only=True)
    # The customer account the booking was sent from, or null when it was
    # sent without signing in.
    account = serializers.SerializerMethodField()
    # The shipment this booking became (see bookings/shipments.py), or null.
    shipment = serializers.SerializerMethodField()
    # Why it can never become one - "no_account" - or null when it can.
    shipment_blocked = serializers.SerializerMethodField()
    # What the warehouse measured: intake sheets and scanner measurements.
    # Read-only - the warehouse writes these, the office reads them here.
    warehouse = serializers.SerializerMethodField()
    # The handling costs by the purchase value, and how many suppliers (stores)
    # the consignment has - see handling_for.
    handling = serializers.SerializerMethodField()
    supplier_count = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = (
            ["id"]
            + OFFICE_FIELDS
            + SENDER_FIELDS
            + [
                "orders",
                "handling",
                "supplier_count",
                "account",
                "shipment",
                "shipment_blocked",
                "warehouse",
                "destination_label",
                "sender_name",
                "recipient_name",
                "status_display",
                "freight_display",
                "packing_display",
                "payment_display",
                "unit_display",
                "vehicle_display",
                "signed_at",
                "created_at",
                "updated_at",
            ]
        )
        read_only_fields = [
            field
            for field in fields
            if field not in OFFICE_FIELDS and field not in OFFICE_EDITABLE
        ]

    def validate_value_eur(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("The value cannot be negative.")
        return value

    def get_account(self, obj):
        return _account(obj.user)

    def get_shipment(self, obj):
        return _office_shipment(obj.package)

    def get_shipment_blocked(self, obj):
        return why_no_shipment(obj)

    def get_handling(self, obj):
        return handling_for(obj)

    def get_supplier_count(self, obj):
        # .all(), so the prefetched stores are counted, not queried again.
        return len(obj.orders.all())

    def get_warehouse(self, obj):
        return _warehouse(obj)


def _number(value):
    """A Decimal as the API sends every decimal - a string - or None."""
    return None if value is None else str(value)


def _person(user):
    if user is None:
        return None
    return user.get_full_name() or user.get_username()


def _warehouse(booking):
    """What the warehouse measured for this booking, for the office to read.

    The warehouse records measurements in two places, and the office wants
    to see both on the booking:

    * intake_sheets - the intake sheet filled in when the goods arrived:
      one line per kind of item ("10 boxes of 60x40x40, 12 kg each") and
      the sheet's totals. A sheet is linked to the booking, or to the
      shipment the booking became, or both - all are shown, once each.

    * package - the weighing and measuring of the shipment on the scanner
      (warehouse.PackageMeasurement). Re-measuring adds a new row rather
      than overwriting, so the newest is the one that counts (`current`) and
      the older ones are kept as history.

    Plus, once the booking has its shipment: where it is on the warehouse
    floor (`stage`, e.g. "Measured") and the photos the workers took - the
    same photos the customer sees on their profile page.

    Reads only what BookingViewSet prefetched, so a page of 25 bookings
    does not make 25 x 4 extra queries.
    """
    from warehouse.models import measurement_totals

    package = booking.package

    # Sheets linked to the booking, plus those linked only to its shipment.
    sheets = {sheet.pk: sheet for sheet in booking.intake_sheets.all()}
    if package is not None:
        for sheet in package.intake_sheets.all():
            sheets.setdefault(sheet.pk, sheet)

    intake = []
    for sheet in sorted(sheets.values(), key=lambda s: s.created_at, reverse=True):
        lines = list(sheet.measurements.all())
        totals = measurement_totals(lines, sheet.freight)
        intake.append(
            {
                "id": sheet.pk,
                "label": sheet.label,
                "status": sheet.status,
                "status_display": sheet.get_status_display(),
                "freight": sheet.freight,
                "created_at": sheet.created_at,
                "released_at": sheet.released_at,
                "created_by": _person(sheet.created_by),
                "lines": [
                    {
                        "quantity": line.quantity,
                        "packaging": line.get_packaging_display() if line.packaging else "",
                        "length_cm": _number(line.length_cm),
                        "width_cm": _number(line.width_cm),
                        "height_cm": _number(line.height_cm),
                        "weight_kg": _number(line.weight_kg),  # per item
                        "complete": line.complete,
                        "note": line.note,
                    }
                    for line in lines
                ],
                "totals": {key: _number(value) for key, value in totals.items()},
            }
        )

    measured = []
    if package is not None:
        # Newest first (the model's ordering), so index 0 is the current one.
        for index, row in enumerate(package.warehouse_measurements.all()):
            measured.append(
                {
                    "current": index == 0,
                    "weight_kg": _number(row.weight_kg),
                    "length_cm": _number(row.length_cm),
                    "width_cm": _number(row.width_cm),
                    "height_cm": _number(row.height_cm),
                    "volume_m3": _number(row.volume_m3),
                    "dimensional_weight_kg": _number(row.dimensional_weight_kg),
                    "measured_at": row.measured_at,
                    "measured_by": _person(row.worker),
                }
            )

    photos = []
    stage = None
    if package is not None:
        stage = {"value": package.warehouse_stage, "label": package.get_warehouse_stage_display()}
        photos = [
            {
                "id": photo.pk,
                # The staff route that streams the photo (never a public media
                # address); the dashboard puts it in an <img> with apiUrl().
                "url": f"/staff/warehouse/shipments/{package.pk}/photos/{photo.pk}/",
                "uploaded_at": photo.uploaded_at,
            }
            for photo in package.photos.all()
        ]

    return {"intake_sheets": intake, "package": measured, "stage": stage, "photos": photos}


def _shipment(package):
    """The few facts about a booking's shipment a list needs, or None.

    What the customer's own "My bookings" gets. The office gets more - see
    _office_shipment.
    """
    if package is None:
        return None
    return {
        "id": package.pk,
        "tracking_number": package.tracking_number,
        "status": package.status,
        "status_display": package.get_status_display(),
    }


def _office_shipment(package):
    """The shipment as the office's Bookings page needs it: also whether it is
    on the warehouse floor, whether it has been measured, and its invoice."""
    from invoicing.pdf import invoice_number

    summary = _shipment(package)
    if summary is None:
        return None
    invoice = getattr(package, "invoice", None)
    return {
        **summary,
        # On the warehouse floor since (null: not sent - no shipping number
        # yet, and not paid either), and where it is there.
        "sent_to_warehouse_at": package.sent_to_warehouse_at,
        "warehouse_stage": package.warehouse_stage,
        # Measured and no invoice yet: the office's cue to make it.
        "ready_to_invoice": ready_to_invoice(package),
        "invoice": (
            {
                "id": invoice.pk,
                "number": invoice_number(invoice),
                "status": invoice.status,
                "status_display": invoice.get_status_display(),
                # Can still be opened in the invoice editor: written there, or
                # raised automatically with no document yet; and not sent.
                "editable": invoice.status in ("draft", "pending_review", "rejected")
                and (invoice.composed or not invoice.pdf),
            }
            if invoice is not None
            else None
        ),
    }


def _account(user):
    if user is None:
        return None
    name = f"{user.first_name} {user.last_name}".strip()
    return {"id": user.pk, "name": name or user.email, "email": user.email}


class MyBookingSerializer(serializers.ModelSerializer):
    """A customer reading back their own bookings ("Mijn boekingen" on the
    profile page). Read-only, and only what they typed plus the counter's
    figures they are entitled to see - the shipping number, the status, the
    measured volume and weight. The office's own remarks (`office_notes`)
    and its verdict on the packing (`packing_quality`) stay in the office."""

    destination_label = serializers.CharField(read_only=True)
    orders = MyOrderSerializer(many=True, read_only=True)
    # The shipment the office made of it, so the customer can find it under
    # "My shipments". Null until the office has started on the booking.
    shipment = serializers.SerializerMethodField()
    # The same handling costs the office sees (handling_for).
    handling = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id",
            "created_at",
            "signed_at",
            "orders",
            "handling",
            "shipment",
            "shipping_number",
            "status",
            "volume_m3",
            "weight_kg",
            "destination_label",
            *[
                field
                for field in SENDER_FIELDS
                # The checkbox and the language are how it was sent, not
                # what was sent.
                if field not in ("agreed_terms", "language")
            ],
        ]
        read_only_fields = fields

    def get_shipment(self, obj):
        return _shipment(obj.package)

    def get_handling(self, obj):
        return handling_for(obj)
