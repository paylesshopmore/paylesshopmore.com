"""Serializers for invoices: the review queue's view and the customer's.

Same arrangement as bookings: the model and its serializers stay with the app
that owns them, and the staff dashboard imports what it needs.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers

from accounts.models import Package

from .errors import InvoiceAlreadyExists
from .models import Invoice, InvoiceLine, InvoiceSettings
from .pdf import invoice_number

User = get_user_model()


class StaffInvoiceSerializer(serializers.ModelSerializer):
    """An invoice as the review queue shows it.

    Every field is read-only. Status is never written by assigning to it — it
    moves through the approve and reject actions, which is what keeps the state
    machine from being bypassed by a plain PATCH.
    """

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    tracking_number = serializers.CharField(
        source="package.tracking_number", read_only=True
    )
    # What the invoice asks for: the lines on a composed invoice, the
    # shipment's value on any other. See Invoice.amount_due.
    value_eur = serializers.DecimalField(
        source="amount_due",
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )
    lines = serializers.SerializerMethodField()
    # The route that streams the document, not the file's own storage URL.
    #
    # This was a FileField with use_url=True, which serves an absolute media
    # path — a working download only where MEDIA_ROOT is published by the web
    # server, and a published MEDIA_ROOT is one where
    # invoices/2026/INV-2026-00002-PLSM-0002.pdf can be fetched by anyone able
    # to guess a tracking number. Every customer can guess one: they are
    # sequential and we print theirs on the label. The customer-facing
    # serializer below already refused to emit a storage path for exactly this
    # reason; the two disagreed, and this is the side that was wrong.
    #
    # Still absolute, still called pdf_url, still null before the render has
    # run — the dashboard cannot tell the difference.
    pdf_url = serializers.SerializerMethodField()
    # Where the dashboard's Print and Download buttons point. Always set:
    # pdf_url when there is a stored document, otherwise the same route with
    # ?draft=1, which draws the invoice as it stands without saving it.
    print_url = serializers.SerializerMethodField()
    customer = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    # The human-facing reference, the same string the customer sees on their
    # own copy and the same one the PDF is named after. Sent rather than
    # rebuilt in JavaScript: it is derived from created_at and the primary key,
    # and a second implementation of that rule in the browser is one that will
    # eventually disagree with the document itself.
    number = serializers.SerializerMethodField()
    # The date on the document, which is not always the day the row was
    # written - see Invoice.dated_on.
    dated_on = serializers.DateField(read_only=True)
    created_by_name = serializers.SerializerMethodField()
    # Enough of the customer and the shipment to check, at a glance, that this
    # invoice is on the right one. The whole point of the create form is
    # getting that pairing right, so the list has to be able to show it.
    customer_id = serializers.IntegerField(source="package.user_id", read_only=True)
    customer_email = serializers.EmailField(source="package.user.email", read_only=True)
    shipment_status = serializers.CharField(
        source="package.get_status_display", read_only=True
    )
    destination = serializers.CharField(
        source="package.destination_label", read_only=True
    )

    # What the document is, alongside pdf_url which says where it is. Read
    # from the row rather than from storage: see Invoice.document_size for why
    # asking the bucket per row is not an option once media lives in one.
    document_uploaded_by_name = serializers.SerializerMethodField()

    def get_document_uploaded_by_name(self, obj):
        """Who attached the file, or None when the render task drew it."""
        return str(obj.document_uploaded_by) if obj.document_uploaded_by_id else None

    def get_pdf_url(self, obj):
        """None until there is a document, so the React side can test it.

        The path, not an absolute URL, and deliberately.

        `request.build_absolute_uri` answers with the host Django was reached
        on. Behind a static host that rewrites /api to the API — which is how
        this site is deployed, and what keeps the session cookie first-party —
        that host is the API's own, not the one the browser is on. The link
        would then point off-origin, the browser would not attach a SameSite
        cookie to it, and the download would come back 403.

        A path resolves against whatever origin the page is already on, which
        is right in every arrangement this project supports: the Vite proxy in
        development, the rewrite in production, and Django serving both if it
        ever does.
        """
        if not obj.pdf:
            return None

        return reverse("staff-invoice-pdf", kwargs={"pk": obj.pk})

    def get_print_url(self, obj):
        url = reverse("staff-invoice-pdf", kwargs={"pk": obj.pk})
        return url if obj.pdf else f"{url}?draft=1"

    class Meta:
        model = Invoice
        fields = [
            "id",
            "number",
            "package",
            "tracking_number",
            "value_eur",
            "customer",
            "customer_id",
            "customer_email",
            "shipment_status",
            "destination",
            "invoice_date",
            "dated_on",
            "created_by",
            "created_by_name",
            "status",
            "status_display",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "rejection_reason",
            "created_at",
            "updated_at",
            "sent_at",
            "pdf_url",
            "print_url",
            "document_filename",
            "document_size",
            "document_content_type",
            "document_uploaded_at",
            "document_uploaded_by",
            "document_uploaded_by_name",
            "composed",
            "lines",
            "shipment_number",
        ]
        read_only_fields = fields

    def get_lines(self, obj):
        """The charges on a composed invoice, in order. Empty on any other."""
        if not obj.composed:
            return []
        return [
            {"kind": line.kind, "description": line.description, "amount": str(line.amount)}
            for line in obj.lines.all()
        ]

    def get_customer(self, obj):
        # str(User) already handles the anonymised case, where there is no name
        # left to show.
        return str(obj.package.user)

    def get_reviewed_by_name(self, obj):
        return str(obj.reviewed_by) if obj.reviewed_by_id else None

    def get_number(self, obj):
        return invoice_number(obj)

    def get_created_by_name(self, obj):
        """Who raised it, or None when nobody did.

        None is the answer for an invoice raised automatically by a shipment
        being marked paid, and the dashboard says so in those words rather
        than leaving a blank column that reads as missing data.
        """
        return str(obj.created_by) if obj.created_by_id else None


class InvoiceCreateSerializer(serializers.Serializer):
    """The body of an invoice raised by hand from the dashboard.

    The one rule this exists for: an invoice belongs to a shipment, a shipment
    belongs to a customer, and the invoice must not end up on a shipment that
    is not that customer's. The form asks for both, and both ids arrive from a
    browser - so the pairing is checked here against the database rather than
    believed. An admin who picks the right customer and then, through a stale
    dropdown or a hand-written request, the wrong shipment is refused; without
    this check they would have published one customer's shipment value, weight
    and destination onto another customer's profile page.

    Duplicate protection is the same idea in the other direction. Invoice.package
    is a OneToOneField, so a second invoice for one shipment is impossible at
    the database level; this turns that impossibility into a sentence and the
    id of the invoice that already exists, so the dashboard can offer to open
    it instead of reporting a constraint violation.

    The invoice number is not here on purpose. It is derived from the year and
    the primary key by invoicing.pdf.invoice_number, so it cannot be known
    before the row exists and must not be typed by hand - two invoices with the
    same reference is a worse problem than not choosing one.
    """

    #: The statuses this form may create. DRAFT is not offered - nothing reads
    #: a draft, and an invoice raised by hand is raised in order to go
    #: somewhere - and REJECTED is a verdict, not a starting point.
    CREATABLE = (
        Invoice.Status.PENDING_REVIEW,
        Invoice.Status.APPROVED,
        Invoice.Status.SENT,
    )

    customer = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        help_text="The account the shipment belongs to.",
    )
    package = serializers.PrimaryKeyRelatedField(
        queryset=Package.objects.all(),
        help_text="The shipment being invoiced.",
    )
    status = serializers.ChoiceField(
        choices=[(value, Invoice.Status(value).label) for value in CREATABLE],
        default=Invoice.Status.SENT,
    )
    invoice_date = serializers.DateField(
        required=False,
        help_text="The date on the document. Today if not given.",
    )
    # The same field, with the same checks, as the upload action on an existing
    # invoice: five magic bytes and a size limit. Reused rather than restated,
    # so a change to what counts as an acceptable PDF happens once.
    pdf = serializers.FileField(
        help_text="The invoice document, as a PDF.",
    )

    def validate_pdf(self, uploaded):
        return InvoiceDocumentSerializer().validate_pdf(uploaded)

    def validate_invoice_date(self, value):
        """A date on a document nobody has written yet is a typo.

        Backdating is normal and allowed - an invoice entered on Monday for
        Friday's work carries Friday. Forward-dating is not: it would put a
        document in the customer's hands that claims to be from next month.
        """
        if value > timezone.localdate():
            raise serializers.ValidationError("An invoice cannot be dated in the future.")
        return value

    def validate(self, attrs):
        customer = attrs["customer"]
        package = attrs["package"]

        # The check the whole endpoint exists for. Compared against the stored
        # row, never against anything the request said about it.
        if package.user_id != customer.pk:
            raise serializers.ValidationError(
                {
                    "package": (
                        f"{package.tracking_number} does not belong to "
                        f"{customer}. An invoice can only be raised for that "
                        "customer's own shipments."
                    )
                }
            )

        existing = Invoice.objects.filter(package=package).first()
        if existing is not None:
            # A 409 carrying the existing invoice's id, so the dashboard can
            # offer to open it rather than only saying no. Not a field error:
            # there is nothing wrong with the shipment the admin picked, and
            # nothing to correct in the form.
            raise InvoiceAlreadyExists(existing)

        return attrs


class InvoiceLineSerializer(serializers.Serializer):
    """One line as the editor sends it. See InvoiceLine for the three kinds."""

    kind = serializers.ChoiceField(choices=InvoiceLine.Kind.choices, default=InvoiceLine.Kind.CHARGE)
    # Blank is allowed here because the insurance and adjustment rows get a
    # standard wording when left empty; a blank *charge* is refused below.
    description = serializers.CharField(max_length=300, allow_blank=True, default="")
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, default=None
    )


def _centimetres():
    """A box side in cm: more than 0, at most 100 metres."""
    return serializers.DecimalField(
        max_digits=7, decimal_places=1, min_value=Decimal("0.1"), max_value=Decimal("10000")
    )


class MeasurementSerializer(serializers.Serializer):
    """One kind of box, as measured with a tape: centimetres, and how many."""

    length_cm = _centimetres()
    width_cm = _centimetres()
    height_cm = _centimetres()
    count = serializers.IntegerField(min_value=1, max_value=10000)


def _money_field(**extra):
    """A euro amount that may be left empty and may not be negative."""
    return serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0"),
        required=False, allow_null=True, default=None, **extra,
    )


class InvoiceEditorSerializer(serializers.Serializer):
    """Everything the invoice editor sends, checked before anything happens.

    Used for four requests: calculate ("Bereken factuur"), preview, save a new
    invoice, and save changes to an existing one. The checks are the same for
    all four, so a form that previews cleanly also saves cleanly.

    The server-side rules, in the order validate() applies them:

    1. The shipment must belong to the chosen customer (the same check as
       for an uploaded invoice - an invoice on the wrong customer's shipment
       would publish one person's goods and address on another's profile).
    2. A shipment gets one invoice. Saving a second is refused with the
       first one's id, so the editor can offer to open it.
    3. Every charge needs a description and an amount of 0 or more.
    4. Contractual adjustments - the only lines allowed to be negative - may
       only be added or changed by an admin.
    5. An insurance line needs an insured value, and a premium when no
       insurance rate is configured.

    Context the view must pass: "request" (for the user), and "invoice" when
    editing an existing invoice.
    """

    #: Where a saved invoice goes. Editing an invoice that is already in the
    #: queue keeps it there; "sent" approves and sends it in one go.
    STATUSES = (Invoice.Status.PENDING_REVIEW, Invoice.Status.SENT)
    MAX_LINES = 60

    customer = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    package = serializers.PrimaryKeyRelatedField(queryset=Package.objects.all())
    status = serializers.ChoiceField(
        choices=[(value, Invoice.Status(value).label) for value in STATUSES],
        default=Invoice.Status.PENDING_REVIEW,
    )
    invoice_date = serializers.DateField(required=False)

    # The invoice number, when the person writing it chose one instead of the
    # next number (to carry on from invoices written elsewhere). Blank or left
    # out = the server hands out the next number when it saves. Only used for a
    # NEW invoice: a saved invoice keeps the number it has.
    number = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")

    # -- header --
    bill_to = serializers.CharField(max_length=1000, allow_blank=True, default="")
    phone = serializers.CharField(max_length=30, allow_blank=True, default="")
    relation_number = serializers.CharField(max_length=50, allow_blank=True, default="")
    order_number = serializers.CharField(max_length=50, allow_blank=True, default="")
    shipment_number = serializers.CharField(max_length=50, allow_blank=True, default="")

    # -- shipment --
    freight = serializers.ChoiceField(choices=Invoice.Freight.choices, default=Invoice.Freight.SEA)
    port_of_loading = serializers.CharField(max_length=100, allow_blank=True, default="")
    port_of_discharge = serializers.CharField(max_length=100, allow_blank=True, default="")
    goods_description = serializers.CharField(max_length=300, allow_blank=True, default="")
    pieces = serializers.IntegerField(min_value=0, max_value=100000, required=False, allow_null=True, default=None)
    weight_kg = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True, default=None
    )
    volume_m3 = serializers.DecimalField(
        max_digits=10, decimal_places=3, min_value=Decimal("0"), required=False, allow_null=True, default=None
    )
    measurements = MeasurementSerializer(many=True, required=False, default=list)

    # -- insurance --
    insured_value = _money_field()
    own_risk = _money_field()
    insurance_fee = _money_field(help_text="Typed by hand; ignored when a rate is configured.")

    # -- VAT --
    export_verified = serializers.BooleanField(default=False)

    lines = InvoiceLineSerializer(many=True)

    def __init__(self, *args, check_duplicates=True, **kwargs):
        # The preview and the calculation of an invoice for a shipment that
        # already has one are still useful to look at, so only saving checks
        # for a duplicate.
        self.check_duplicates = check_duplicates
        super().__init__(*args, **kwargs)

    def validate_number(self, value):
        value = value.strip()
        if not value:
            return ""
        # Letters, digits and dashes only: the number becomes a file name.
        if not value.replace("-", "").isalnum():
            raise serializers.ValidationError("Use only letters, digits and dashes.")
        # Never two invoices with one number. (The same check runs again at
        # save time, under a lock, in case somebody else just took it.)
        used = Invoice.objects.filter(reference__iexact=value)
        editing = self.context.get("invoice")
        if editing is not None:
            used = used.exclude(pk=editing.pk)
        if used.exists():
            raise serializers.ValidationError("That invoice number is already used by another invoice.")
        return value

    def validate_invoice_date(self, value):
        return InvoiceCreateSerializer().validate_invoice_date(value)

    def validate_measurements(self, value):
        if len(value) > 50:
            raise serializers.ValidationError("At most 50 different box sizes.")
        return value

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("Add at least one charge.")
        if len(value) > self.MAX_LINES:
            raise serializers.ValidationError(f"An invoice can have at most {self.MAX_LINES} lines.")

        errors = []
        for number, line in enumerate(value, start=1):
            kind = line["kind"]
            amount = line.get("amount")
            if kind == InvoiceLine.Kind.CHARGE:
                if not line["description"].strip():
                    errors.append(f"Line {number}: a charge needs a description.")
                if amount is None:
                    errors.append(f"Line {number}: a charge needs an amount.")
                elif amount < 0:
                    errors.append(
                        f"Line {number}: a charge cannot be negative. Use a contractual "
                        "adjustment for money back."
                    )
            elif kind == InvoiceLine.Kind.ADJUSTMENT and amount is None:
                errors.append(f"Line {number}: an adjustment needs an amount.")

        if sum(1 for line in value if line["kind"] == InvoiceLine.Kind.INSURANCE) > 1:
            errors.append("An invoice can have only one insurance line.")

        if errors:
            raise serializers.ValidationError(errors)
        return value

    def validate(self, attrs):
        customer = attrs["customer"]
        package = attrs["package"]
        editing = self.context.get("invoice")

        # 1. the pairing
        if package.user_id != customer.pk:
            raise serializers.ValidationError(
                {
                    "package": (
                        f"{package.tracking_number} does not belong to {customer}. "
                        "An invoice can only be raised for that customer's own shipments."
                    )
                }
            )
        if editing is not None and editing.package_id != package.pk:
            raise serializers.ValidationError(
                {"package": "An invoice cannot be moved to another shipment."}
            )

        # 2. one invoice per shipment
        if self.check_duplicates and editing is None:
            existing = Invoice.objects.filter(package=package).first()
            if existing is not None:
                raise InvoiceAlreadyExists(existing)

        # 4. adjustments are an admin's decision
        user = self.context["request"].user
        wanted = [
            (line["description"].strip(), line["amount"])
            for line in attrs["lines"]
            if line["kind"] == InvoiceLine.Kind.ADJUSTMENT
        ]
        current = (
            [
                (line.description, line.amount)
                for line in editing.lines.all()
                if line.kind == InvoiceLine.Kind.ADJUSTMENT
            ]
            if editing is not None
            else []
        )
        if wanted != current and not user.is_admin:
            raise serializers.ValidationError(
                {"lines": ["Only an admin can add or change a contractual adjustment."]}
            )

        # 5. insurance
        if any(line["kind"] == InvoiceLine.Kind.INSURANCE for line in attrs["lines"]):
            if attrs.get("insured_value") is None:
                raise serializers.ValidationError(
                    {"insured_value": "Fill in the insured value for the insurance line."}
                )
            rate = InvoiceSettings.load().insurance_rate_percent
            if rate is None and attrs.get("insurance_fee") is None:
                raise serializers.ValidationError(
                    {"insurance_fee": "No insurance rate is configured, so type the premium."}
                )

        return attrs


class InvoiceEditorReadSerializer(serializers.ModelSerializer):
    """A composed invoice in the shape the editor sends it, for loading back.

    Opening an existing invoice in the editor (to review or correct it) reads
    this, so the form can be filled in exactly as it was saved - without
    taking a new number.
    """

    number = serializers.SerializerMethodField()
    customer = serializers.IntegerField(source="package.user_id", read_only=True)
    customer_name = serializers.CharField(source="package.user.__str__", read_only=True)
    lines = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    editable = serializers.SerializerMethodField()
    insurance_fee = serializers.SerializerMethodField()

    #: Statuses an invoice can still be corrected in. Once approved, the PDF
    #: is being drawn or is with the customer, and the document is final.
    EDITABLE = (Invoice.Status.DRAFT, Invoice.Status.PENDING_REVIEW, Invoice.Status.REJECTED)

    class Meta:
        model = Invoice
        fields = [
            "id", "number", "status", "status_display", "editable", "rejection_reason",
            "customer", "customer_name", "package", "invoice_date", "dated_on",
            "bill_to", "phone", "relation_number", "order_number", "shipment_number",
            "freight", "port_of_loading", "port_of_discharge", "goods_description",
            "pieces", "weight_kg", "volume_m3", "volume_weight_kg", "measurements",
            "insured_value", "own_risk", "insurance_fee", "export_verified", "vat_rate",
            "texts", "lines", "totals",
        ]
        read_only_fields = fields

    def get_number(self, obj):
        return invoice_number(obj)

    def get_lines(self, obj):
        return [
            {"kind": line.kind, "description": line.description, "amount": str(line.amount)}
            for line in obj.lines.all()
        ]

    def get_totals(self, obj):
        return {key: str(value) for key, value in obj.totals().items()}

    def get_editable(self, obj):
        return obj.status in self.EDITABLE

    def get_insurance_fee(self, obj):
        line = next((line for line in obj.lines.all() if line.kind == InvoiceLine.Kind.INSURANCE), None)
        return str(line.amount) if line else None


class InvoiceRejectSerializer(serializers.Serializer):
    """The body of a reject request.

    allow_blank is left at its default of False, so an empty string is a 400
    with a field error rather than something the view has to notice. The model
    refuses a blank reason as well — this is the layer that produces a helpful
    message, not the layer that guarantees the rule.
    """

    rejection_reason = serializers.CharField(
        max_length=2000,
        trim_whitespace=True,
        help_text="Shown to whoever corrects the invoice, so it has to be specific.",
    )


class CustomerInvoiceSerializer(serializers.ModelSerializer):
    """An invoice as the customer who paid for it sees it.

    Deliberately smaller than StaffInvoiceSerializer. Nothing about the review
    is here — who approved it, when they approved it, why an earlier version
    was rejected are all internal, and the queryset in InvoiceViewSet only ever
    hands this serializer invoices that have been sent anyway.

    There is no pdf_url either. The stored path must not reach the browser: it
    would be a MEDIA_URL link to somebody's name, address and shipment value,
    guarded by nothing but the filename. `download_url` points at the view that
    checks the session instead.
    """

    number = serializers.SerializerMethodField()
    tracking_number = serializers.CharField(
        source="package.tracking_number", read_only=True
    )
    description = serializers.CharField(source="package.description", read_only=True)
    value_eur = serializers.DecimalField(
        source="amount_due",
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )
    download_url = serializers.SerializerMethodField()
    # The name the file downloads under and how big it is, so the list can say
    # "PDF, 84 KB" before somebody commits to fetching it on a phone. Nothing
    # about who inside the office attached it: document_uploaded_by is staff
    # bookkeeping and is on the staff serializer only.
    filename = serializers.CharField(source="document_filename", read_only=True)
    size_bytes = serializers.IntegerField(source="document_size", read_only=True)
    # The date on the document, so the customer's list and the PDF agree. See
    # Invoice.dated_on for why this is not simply created_at.
    dated_on = serializers.DateField(read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "number",
            "tracking_number",
            "description",
            "value_eur",
            "dated_on",
            "sent_at",
            "created_at",
            "download_url",
            "filename",
            "size_bytes",
        ]
        read_only_fields = fields

    def get_number(self, obj):
        return invoice_number(obj)

    def get_download_url(self, obj):
        """The path, not an absolute URL, and deliberately.

        `request.build_absolute_uri` answers with the host Django was reached
        on. Behind a static host that rewrites /api to the API — which is how
        this site is deployed, and what keeps the session cookie first-party —
        that host is the API's own, not the one the browser is on. The link
        would then point off-origin, the browser would not attach a SameSite
        cookie to it, and the download would come back 403.

        A path resolves against whatever origin the page is already on, which
        is right in every arrangement this project supports: the Vite proxy in
        development, the rewrite in production, and Django serving both if it
        ever does.
        """
        return reverse("invoice-pdf", kwargs={"pk": obj.pk})


class InvoiceDocumentSerializer(serializers.Serializer):
    """The body of a document upload: one PDF, checked before it is stored.

    An uploaded file is the one thing on this API that a browser hands over
    verbatim, so nothing about it is taken on trust. The name it arrives with
    is decoration — Django's storage backend picks the stored name — and the
    content type is whatever the browser felt like claiming, so the check that
    actually holds is the one against the first five bytes.
    """

    # 10 MB. DATA_UPLOAD_MAX_MEMORY_SIZE is 11 MB, so this refuses with a
    # field error the form can show rather than with Django's own 413 further
    # up, which arrives as an opaque failure.
    MAX_BYTES = 10 * 1024 * 1024

    # Every PDF begins with these five bytes. A file that does not is not one,
    # whatever it is called and whatever the browser said it was.
    MAGIC = b"%PDF-"

    pdf = serializers.FileField(
        help_text="The invoice document, as a PDF.",
    )

    def validate_pdf(self, uploaded):
        if uploaded.size == 0:
            raise serializers.ValidationError("That file is empty.")

        if uploaded.size > self.MAX_BYTES:
            megabytes = self.MAX_BYTES // (1024 * 1024)
            raise serializers.ValidationError(
                f"That file is larger than {megabytes} MB."
            )

        head = uploaded.read(len(self.MAGIC))
        # Rewound, or whatever stores the file afterwards starts five bytes in
        # and writes a document no reader will open.
        uploaded.seek(0)

        if head != self.MAGIC:
            raise serializers.ValidationError(
                "That file is not a PDF. Invoices are sent to customers as "
                "PDFs, so only a PDF can be attached to one."
            )

        return uploaded
