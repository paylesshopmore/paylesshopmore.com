"""The booking form (boekingsbon), as a record rather than a sheet of paper.

The paper form is filled in by two people. The customer knows who is sending,
who is receiving, what is in the boxes and what it is worth; the office knows
the shipping number, the volume, the weight and whether the packing was done
properly. Both halves live on this one row, and which half a field belongs to
is written against it below — that split is what the API and the dashboard are
both built around.
"""

import os
import re
import uuid

from django.conf import settings
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.utils import timezone

# Same shape as the accounts app uses: numbers are written a dozen ways across
# the islands and the Netherlands, so this only checks it is plausible.
phone_validator = RegexValidator(
    regex=r"^\+?[\d\s()-]{7,20}$",
    message="Enter a valid phone number, for example +599 9 123 4567.",
)


class Booking(models.Model):
    """One booking form."""

    class Status(models.TextChoices):
        NEW = "new", "New"
        CONFIRMED = "confirmed", "Confirmed"
        BOOKED_IN = "booked_in", "Booked in"
        SHIPPED = "shipped", "Shipped"
        CANCELLED = "cancelled", "Cancelled"

    class Freight(models.TextChoices):
        SEA = "sea", "Zeevracht"
        AIR = "air", "Luchtvracht"

    class Destination(models.TextChoices):
        ARUBA = "AW", "Aruba"
        BONAIRE = "BQ", "Bonaire"
        CURACAO = "CW", "Curaçao"
        SINT_MAARTEN = "SX", "Sint Maarten"
        SURINAME = "SR", "Suriname"
        OTHER = "other", "Overig"

    class Packing(models.TextChoices):
        SENDER = "sender", "Door u"
        COMPANY = "company", "Door Pay Less Shop More"

    class PackingQuality(models.TextChoices):
        GOOD = "good", "Goed"
        POOR = "poor", "Niet goed"

    class Payment(models.TextChoices):
        CASH = "cash", "Contant"
        BANK = "bank", "Bank"

    class Unit(models.TextChoices):
        BOXES = "boxes", "Dozen"
        PALLETS = "pallets", "Pallets"
        COLLI = "colli", "Colli"

    class Vehicle(models.TextChoices):
        NOT_APPLICABLE = "na", "N.v.t."
        COMBUSTION = "combustion", "Benzine/Diesel"
        ELECTRIC = "electric", "Elektrisch/Hybride"

    # ---- office --------------------------------------------------------
    # Blank when the customer submits; filled in at the counter afterwards.

    shipping_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="Assigned by the office. Left empty on submission.",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)

    volume_m3 = models.DecimalField(
        max_digits=8, decimal_places=3, null=True, blank=True,
        help_text="Measured at the counter.",
    )
    weight_kg = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True,
        help_text="Measured at the counter.",
    )
    packing_quality = models.CharField(
        max_length=10,
        choices=PackingQuality.choices,
        blank=True,
        help_text="The office's assessment of the sender's packing, not the sender's.",
    )
    office_notes = models.TextField(
        blank=True, help_text="Internal. Never shown to the customer."
    )
    # When the office was e-mailed about this new booking (bookings/tasks.py).
    # Null until it went out; claimed before sending, so a retried job never
    # mails the same booking twice.
    office_emailed_at = models.DateTimeField(null=True, blank=True, editable=False)

    # ---- shipment ------------------------------------------------------

    freight = models.CharField(max_length=10, choices=Freight.choices, default=Freight.SEA)
    destination = models.CharField(max_length=10, choices=Destination.choices)
    # Only meaningful when destination is "other"; the serializer requires it
    # in that case and clears it otherwise.
    destination_other = models.CharField(max_length=100, blank=True)

    # ---- sender --------------------------------------------------------

    sender_first_name = models.CharField(max_length=150)
    sender_last_name = models.CharField(max_length=150)
    sender_address = models.CharField(max_length=255)
    sender_postal_code = models.CharField(max_length=20)
    sender_city = models.CharField(max_length=100)
    sender_phone = models.CharField(max_length=20, validators=[phone_validator])
    sender_email = models.EmailField()

    # ---- recipient -----------------------------------------------------

    recipient_first_name = models.CharField(max_length=150)
    recipient_last_name = models.CharField(max_length=150)
    recipient_address = models.CharField(max_length=255)
    recipient_city = models.CharField(max_length=100)
    recipient_phone = models.CharField(max_length=20, validators=[phone_validator])
    # The paper form has a box for it, but the agent phones rather than writes,
    # so an address on the island is enough to complete a delivery without it.
    recipient_email = models.EmailField(blank=True)
    # The recipient's Crib number, their tax number on the island. Optional,
    # like the e-mail: a sender often does not know it, and the shipment can
    # be booked without it.
    recipient_crib_number = models.CharField(max_length=30, blank=True)

    # ---- the consignment ------------------------------------------------

    packing = models.CharField(
        max_length=10, choices=Packing.choices, default=Packing.SENDER
    )
    payment = models.CharField(
        max_length=10, choices=Payment.choices, default=Payment.BANK
    )

    # Empty when the sender does not know yet. Whoever orders online cannot
    # tell how many parcels the shop will send it in; the count is only
    # certain once they have all reached the warehouse.
    quantity = models.PositiveIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1)]
    )
    unit = models.CharField(max_length=10, choices=Unit.choices, default=Unit.BOXES)

    contents = models.TextField(blank=True)
    # "Zie bijlage" on the paper form: the list came separately.
    contents_attached = models.BooleanField(default=False)

    # Decimal, never float: this figure is what customs charges duty on.
    #
    # Optional: the booking form no longer asks for it. The customer shows
    # what they bought with a screenshot per store (BookingOrder), and the
    # office fills the value in from that on the dashboard - which is why
    # staff may edit it (see OFFICE_EDITABLE in bookings/serializers.py).
    value_eur = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    vehicle = models.CharField(
        max_length=12, choices=Vehicle.choices, default=Vehicle.NOT_APPLICABLE
    )

    # ---- emigration -----------------------------------------------------
    # Four Ja/Nee boxes that only matter when somebody is moving rather than
    # sending a parcel; the form hides them unless emigration is ticked.

    emigration = models.BooleanField(default=False)
    id_present = models.BooleanField(default=False)
    deregistered = models.BooleanField(default=False)
    deregistration_present = models.BooleanField(default=False)

    # ---- insurance ------------------------------------------------------

    insured = models.BooleanField(default=False)
    insured_value_eur = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )

    notes = models.TextField(blank=True, help_text="The sender's own remarks.")

    # ---- signature ------------------------------------------------------
    #
    # Typed rather than drawn, which is the point of the digital form: nobody
    # needs a pen. What makes it a signature is the three of these together —
    # the name typed, the terms explicitly agreed to, and the moment it
    # happened — not the shape of the letters.

    signature_name = models.CharField(
        max_length=200,
        help_text="Typed by the sender in place of a handwritten signature.",
    )
    agreed_terms = models.BooleanField(default=False)
    signed_at = models.DateTimeField(null=True, blank=True)

    # Set when a signed-in customer books, so their bookings can be found from
    # their account. Null for anyone booking without an account, which the
    # form allows.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bookings",
    )
    language = models.CharField(max_length=5, blank=True)

    # The shipment this booking became, once the office started working on
    # it (see bookings/shipments.py). It is what the customer then follows
    # under "My shipments". Null while the booking is New, when it is
    # cancelled, and when it was sent without an account.
    #
    # One booking, one shipment: OneToOne. SET_NULL, so removing a shipment
    # in the admin never deletes what the customer sent in.
    package = models.OneToOneField(
        "accounts.Package",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="booking",
        editable=False,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["shipping_number"]),
        ]

    def __str__(self):
        who = f"{self.sender_first_name} {self.sender_last_name}".strip()
        return f"{self.shipping_number or 'unnumbered'} — {who}"

    @property
    def destination_label(self):
        """The destination as written, including a free-text "Overig"."""
        if self.destination == self.Destination.OTHER:
            return self.destination_other or self.get_destination_display()
        return self.get_destination_display()

    @property
    def sender_name(self):
        return f"{self.sender_first_name} {self.sender_last_name}".strip()

    @property
    def recipient_name(self):
        return f"{self.recipient_first_name} {self.recipient_last_name}".strip()


def booking_attachment_path(instance, filename):
    """Where a booking's screenshot or photo is written, under MEDIA_ROOT.

    A random name, never the customer's own: their filename is kept in
    `original_name` for display only, so nothing they type ends up in a path.
    The extension has already been checked against the file's contents (see
    BookingAttachment.SIGNATURES) by the time this runs."""
    extension = os.path.splitext(filename or "")[1].lower()
    return f"bookings/{timezone.now():%Y}/{instance.booking_id}/{uuid.uuid4().hex}{extension}"


class BookingOrder(models.Model):
    """One store on the booking form: which webshop the customer bought from
    and what they bought there ("Uw bestellingen" on the form). A booking
    has one or more, and each can carry a screenshot of the order
    (BookingAttachment.order).

    The booking's `contents` - what customs reads - is written from these
    rows when the form is sent, so the office still has one line saying what
    is in the shipment."""

    # More than this on one booking is not a real shipment.
    MAX_ORDERS = 10

    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="orders")
    # The store from the list on the site (Dashboard -> Shops), when it was
    # one of those. SET_NULL: removing a store from the list later must not
    # delete what customers booked from it - shop_name keeps the name.
    shop = models.ForeignKey(
        "shops.Shop",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="booking_orders",
    )
    # The store's name as it was when booked: the listed store's name, or
    # what the customer typed for "another store".
    shop_name = models.CharField(max_length=80)
    # What they bought there, in their own words.
    description = models.CharField(max_length=255)
    # The webshop's track-and-trace for this order, typed (or pasted) by the
    # customer after booking: a code like 3SABC1234567, or the carrier's link.
    # Text, not a document - see MyOrderTrackingView.
    tracking_code = models.CharField(max_length=255, blank=True)
    # The order the rows were filled in, kept so they read back the same way.
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return f"{self.shop_name}: {self.description}"


class BookingAttachment(models.Model):
    """A file about a webshop order on a booking.

    The screenshot sent with the booking form (one per store row), and the
    documents the customer adds to a store row afterwards, from their profile
    page: the order confirmation, the invoice, the track-and-trace. `kind`
    tells them apart.

    Private: never linked to directly. The customer who sent the booking
    reads it through /api/bookings/mine/..., the office through the staff
    API; both check who is asking before a byte is sent."""

    # What the first bytes of each allowed type look like. Checked on upload
    # (bookings/serializers.py validate_attachment), so a renamed .exe or an
    # HTML page saved as .png is refused. WebP is a RIFF file whose type sits
    # at bytes 8-12, checked separately there.
    SIGNATURES = {
        ".png": (b"\x89PNG\r\n\x1a\n",),
        ".jpg": (b"\xff\xd8\xff",),
        ".jpeg": (b"\xff\xd8\xff",),
        ".webp": (b"RIFF",),
        ".pdf": (b"%PDF-",),
    }
    CONTENT_TYPES = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
    }

    # 10 MB each: a phone screenshot is well under one megabyte.
    MAX_BYTES = 10 * 1024 * 1024

    # Documents a customer may add to one store row after booking. Enough for
    # an order confirmation, an invoice, a track-and-trace and a few redos.
    MAX_DOCUMENTS_PER_ORDER = 10

    class Kind(models.TextChoices):
        # Sent with the booking form; at most one per store row.
        SCREENSHOT = "screenshot", "Screenshot"
        # Added from the profile page afterwards.
        ORDER_CONFIRMATION = "order_confirmation", "Order confirmation"
        INVOICE = "invoice", "Invoice"
        TRACKING = "tracking", "Track-and-trace"
        OTHER = "other", "Other"
        # Sent with the booking form for one product (BookingProduct.screenshot).
        PRODUCT = "product", "Product screenshot"

    # Sent with the booking form: part of what was submitted, so never
    # removable afterwards, and not one of the store's later documents.
    FORM_KINDS = (Kind.SCREENSHOT, Kind.PRODUCT)

    # The kinds a customer can choose when adding a document later.
    DOCUMENT_KINDS = (
        Kind.ORDER_CONFIRMATION,
        Kind.INVOICE,
        Kind.TRACKING,
        Kind.OTHER,
    )

    # CASCADE: the screenshots mean nothing without the booking they were
    # sent with.
    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE, related_name="attachments"
    )
    # The store row it shows the order for.
    order = models.ForeignKey(
        BookingOrder,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="screenshots",
    )
    file = models.FileField(upload_to=booking_attachment_path)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.SCREENSHOT)
    # What the customer called it, for showing back to them. Never used to
    # build the stored path.
    original_name = models.CharField(max_length=255, blank=True)
    # From the checked extension, not from what the browser claimed.
    content_type = models.CharField(max_length=100)
    size_bytes = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.original_name or self.file.name} ({self.booking})"

    @property
    def is_image(self):
        return self.content_type.startswith("image/")


def validate_product_url(value):
    """A product link must be a secure web address: https:// only, with a host,
    and nothing a browser could run ("javascript:", "data:" ...). Plain
    http:// is refused too: every webshop serves https, and the office should
    never be sent to an unencrypted page.

    Checked here rather than with URLValidator alone, because what matters is
    the scheme: the office clicks these links, so the rule is "only ever a
    secure web page", whatever else the text looks like."""
    from urllib.parse import urlsplit

    from django.core.exceptions import ValidationError

    text = value or ""
    # Spaces, tabs and control characters are how "java\tscript:" sneaks past
    # a scheme check in some browsers.
    if any(ch.isspace() or ord(ch) < 32 or ord(ch) == 127 for ch in text):
        raise ValidationError("A product link cannot contain spaces.")
    try:
        parts = urlsplit(text)
    except ValueError as error:
        raise ValidationError("This is not a valid link.") from error
    if parts.scheme.lower() != "https":
        raise ValidationError("Only secure links starting with https:// can be added.")
    if not parts.hostname or "." not in parts.hostname:
        raise ValidationError("Paste the full link, for example https://www.bol.com/...")


class BookingProduct(models.Model):
    """One product within a store row: what exactly the customer bought, with
    a link to it on the webshop, the price they paid and how many.

    "Store: bol.com" has one BookingOrder; "white T-shirt, 2 × €19.99" and
    "black shoes, 1 × €59.99" are two of these under it. The office follows
    the link to see exactly what was ordered and checks the price.

    The customer's price is never changed: it is what they told us. What the
    office finds on the webshop goes in `verified_price_eur`, next to it, with
    a status and the office's own notes - which the customer never sees
    (MyProductSerializer leaves them out).

    Prices are checked by hand. Webshops do not all allow prices to be read
    automatically, and a price read wrongly is worse than one not read; an
    integration for a particular shop can fill verified_price_eur later."""

    # More than this under one store is not a real order.
    MAX_PER_ORDER = 20

    class Verification(models.TextChoices):
        NOT_CHECKED = "not_checked", "Not checked"
        VERIFIED = "verified", "Verified"
        PRICE_CHANGED = "price_changed", "Price changed"
        UNAVAILABLE = "unavailable", "Product unavailable"

    # The store row (and through it, the booking - the consignment). CASCADE
    # with the store: a product means nothing without it.
    order = models.ForeignKey(BookingOrder, on_delete=models.CASCADE, related_name="products")
    # Also stored directly, so the office can list one booking's products
    # without a join through the stores, and so the owner check is one field.
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="products")

    # What the customer says it is ("White T-shirt, size L").
    description = models.CharField(max_length=255)
    url = models.URLField(max_length=2000, blank=True, validators=[validate_product_url])
    customer_price_eur = models.DecimalField(
        "price reported by the customer (EUR)",
        max_digits=10, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )
    quantity = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    # A screenshot of this product, when the customer added one. A private
    # BookingAttachment like every other customer file: read only through the
    # checked download routes.
    screenshot = models.OneToOneField(
        BookingAttachment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="product",
    )

    # ---- the office's half -------------------------------------------------
    verified_price_eur = models.DecimalField(
        "price on the webshop, checked by the office (EUR)",
        max_digits=10, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )
    verification_status = models.CharField(
        max_length=20, choices=Verification.choices, default=Verification.NOT_CHECKED
    )
    # Internal. Never sent to the customer.
    staff_notes = models.TextField(blank=True)
    verified_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    verified_at = models.DateTimeField(null=True, blank=True)

    position = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "id"]
        indexes = [models.Index(fields=["booking", "verification_status"])]

    def __str__(self):
        return f"{self.order.shop_name}: {self.description}"

    @property
    def store_name(self):
        return self.order.shop_name

    @property
    def customer_subtotal_eur(self):
        """Price × quantity, as the customer reported it, or None without a price."""
        if self.customer_price_eur is None:
            return None
        return self.customer_price_eur * self.quantity


class ShippingNumberSequence(models.Model):
    """The office's shipping numbers, counting up: PLSM-00001, PLSM-00002, ...

    One row. next_number() takes the next one inside the caller's transaction,
    with the row locked, so two people sending a booking at the same moment
    never get the same number. Starts above the highest PLSM-<digits> number
    already on a booking, so numbers typed by hand before this existed are not
    handed out again.
    """

    PREFIX = "PLSM-"
    DIGITS = 5

    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "shipping number counter"

    def __str__(self):
        return f"Last shipping number: {self.format(self.last_number)}"

    @classmethod
    def format(cls, number):
        return f"{cls.PREFIX}{number:0{cls.DIGITS}d}"

    @classmethod
    def _in_use(cls):
        """Every PLSM-<digits> number already given out: on bookings, intake
        sheets and shipments."""
        from accounts.models import Package
        from warehouse.models import IntakeSheet

        sources = (
            (Booking.objects, "shipping_number"),
            (IntakeSheet.objects, "reference"),
            (Package.objects, "tracking_number"),
        )
        for manager, field in sources:
            yield from manager.filter(**{f"{field}__istartswith": cls.PREFIX}).values_list(field, flat=True)

    @classmethod
    def highest_in_use(cls):
        highest = 0
        pattern = re.compile(rf"^{re.escape(cls.PREFIX)}(\d+)$", re.IGNORECASE)
        for number in cls._in_use():
            match = pattern.match(number.strip())
            if match:
                highest = max(highest, int(match.group(1)))
        return highest

    @classmethod
    def taken(cls, value):
        return any(number.strip().upper() == value.upper() for number in cls._in_use())

    @classmethod
    def next_number(cls):
        """The next free shipping number. Call inside a transaction."""
        row, _ = cls.objects.select_for_update().get_or_create(pk=1)
        number = max(row.last_number, cls.highest_in_use()) + 1
        while cls.taken(cls.format(number)):
            number += 1
        row.last_number = number
        row.save(update_fields=["last_number"])
        return cls.format(number)
