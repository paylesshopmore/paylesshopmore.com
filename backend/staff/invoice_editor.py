"""The invoice editor's API: the routes behind the dashboard's invoice form.

Mixed into staff.views.InvoiceViewSet, so every route below lives under
/api/staff/invoices/ and is behind IsStaff (admins and office workers) like
the rest of the invoice queue. Deleting is narrower: admins only.

    GET    compose-defaults/?package=<id>  what the form starts with
    POST   calculate/                       "Bereken factuur": the server's totals
    POST   preview/                         the PDF, drawn without saving
    POST   compose/                         save a new invoice (takes a number)
    GET    <id>/edit/                       load a saved invoice into the form
    PUT    <id>/edit/                       save changes (keeps its number)
    GET    <id>/history/                    who changed what, and when
    DELETE <id>/                            delete an unsent invoice (admins)

For a junior developer, the life of a request here is always the same:

    body = InvoiceEditorSerializer(data=..., context=...)
    body.is_valid(raise_exception=True)     # 400 with field errors if not
    fields, lines, totals = prepare(...)    # invoicing/composer.py
    ... save, draw or just answer ...

The serializer checks what was typed, `prepare` works out what the server is
responsible for (volume, insurance premium, VAT rate), and only then does
anything get written.
"""

import base64

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.response import Response

from accounts.models import Package, SiteSettings
from invoicing.composer import prepare, shipment_defaults, snapshot, totals_as_json
from invoicing.errors import InvoiceAlreadyExists
from invoicing.models import (
    InvalidInvoiceTransition,
    Invoice,
    InvoiceHistory,
    InvoiceLine,
    InvoiceNumberSequence,
)
from invoicing.pdf import document_from_values, render_document
from invoicing.serializers import (
    InvoiceEditorReadSerializer,
    InvoiceEditorSerializer,
    StaffInvoiceSerializer,
)
from invoicing.services import ensure_invoice_for_package

# The fields of a composed invoice that come from its shipment, filled in when
# an automatically raised invoice is first opened in the editor (adoptable).
ADOPTED_FIELDS = (
    "bill_to", "phone", "relation_number", "order_number", "shipment_number", "freight",
    "port_of_loading", "port_of_discharge", "goods_description", "pieces", "weight_kg",
    "volume_m3", "insured_value", "measurements",
)


def adoptable(invoice):
    """An invoice raised automatically when its shipment was paid, with no
    document yet and still open: the editor may take it over, keeping its
    number. Saving it from the editor makes it a composed invoice like one
    written there from the start, with its charges and a PDF drawn from them."""
    return (
        not invoice.composed
        and not invoice.pdf
        and invoice.status in InvoiceEditorReadSerializer.EDITABLE
    )


def with_shipment_defaults(invoice):
    """The automatic invoice as the editor should first see it: filled in
    from its shipment (and the warehouse's measurements), no charges yet.
    In memory only - nothing is saved until the editor saves."""
    defaults = shipment_defaults(invoice.package)
    for name in ADOPTED_FIELDS:
        setattr(invoice, name, defaults.get(name))
    if invoice.measurements is None:
        invoice.measurements = []
    invoice.composed = True
    return invoice


class InvoiceLocked(APIException):
    """409: the invoice exists but is past the point where it can change."""

    status_code = http_status.HTTP_409_CONFLICT
    default_detail = "This invoice can no longer be changed."


def _save_lines(invoice, lines):
    """Replace an invoice's lines with `lines` [(kind, description, amount)]."""
    invoice.lines.all().delete()
    InvoiceLine.objects.bulk_create(
        InvoiceLine(invoice=invoice, position=position, kind=kind, description=description, amount=amount)
        for position, (kind, description, amount) in enumerate(lines)
    )


class InvoiceEditorMixin:
    """The editor's routes. See the module docstring for the list."""

    # ---- helpers -----------------------------------------------------------

    def _editor_body(self, request, *, invoice=None, check_duplicates=True):
        """Validate the editor's form. Raises a 400 (or 409) when it is wrong."""
        body = InvoiceEditorSerializer(
            data=request.data,
            context={"request": request, "invoice": invoice},
            check_duplicates=check_duplicates,
        )
        body.is_valid(raise_exception=True)
        return body.validated_data

    def _invoice_payload(self, invoice):
        """The saved invoice the way the queue shows it."""
        return StaffInvoiceSerializer(
            self.base_queryset().get(pk=invoice.pk),
            context=self.get_serializer_context(),
        ).data

    # ---- reading -----------------------------------------------------------

    @action(detail=False, methods=["get"], url_path="compose-defaults")
    def compose_defaults(self, request):
        """What the form says for ?package=<id> before anybody types.

        Includes the number a new invoice would get, as a preview only - it is
        not reserved, and somebody else may save first.
        """
        package_id = request.query_params.get("package", "")
        if not package_id.isdigit():
            raise ValidationError({"package": "Choose a shipment."})

        package = get_object_or_404(
            Package.objects.select_related("user", "delivery_address", "booking", "invoice"),
            pk=int(package_id),
        )
        return Response(
            {
                **shipment_defaults(package),
                "next_number": InvoiceNumberSequence.peek(timezone.localdate().year),
            }
        )

    @action(detail=True, methods=["get", "put"], url_path="edit")
    def edit(self, request, pk=None):
        """GET: load a composed invoice into the editor. PUT: save changes.

        Saving changes keeps the invoice's number: it is the same invoice,
        corrected. Only possible while it is a draft, waiting for review or
        rejected - once approved, the PDF is drawn and the customer has it.
        A rejected invoice goes back into the review queue when corrected.
        """
        invoice = self.get_object()
        adopting = adoptable(invoice)
        if not invoice.composed and not adopting:
            raise InvoiceLocked(
                "This invoice was uploaded as a PDF, not written in the editor, "
                "so there is nothing to edit here."
            )

        if request.method == "GET":
            if adopting:
                invoice = with_shipment_defaults(invoice)
            return Response(InvoiceEditorReadSerializer(invoice).data)

        if invoice.status not in InvoiceEditorReadSerializer.EDITABLE:
            raise InvoiceLocked(
                f"This invoice is {invoice.get_status_display().lower()} and can no "
                "longer be changed."
            )

        data = self._editor_body(request, invoice=invoice)
        # The wording printed on it stays what it was when it was written;
        # an automatic invoice being taken over gets today's.
        fields, lines, _ = prepare(data, texts=None if adopting else invoice.texts)
        dated = data.get("invoice_date") or invoice.dated_on

        try:
            with transaction.atomic():
                locked = Invoice.objects.select_for_update().get(pk=invoice.pk)
                if locked.status not in InvoiceEditorReadSerializer.EDITABLE:
                    raise InvoiceLocked()

                # An automatic invoice becomes a composed one here (prepare's
                # fields say composed=True), keeping its number.
                Invoice.objects.filter(pk=locked.pk).update(
                    invoice_date=dated, updated_at=timezone.now(), **fields
                )
                locked.refresh_from_db()
                _save_lines(locked, lines)

                if locked.status == Invoice.Status.REJECTED:
                    locked.submit_for_review()
                if data["status"] == Invoice.Status.SENT:
                    locked.approve(request.user)

                InvoiceHistory.objects.create(
                    invoice=locked,
                    reference=locked.reference or "",
                    action=InvoiceHistory.Action.UPDATED,
                    actor=request.user,
                    snapshot=snapshot(locked),
                )
        except InvalidInvoiceTransition as exc:
            raise InvoiceLocked(str(exc)) from exc

        return Response(self._invoice_payload(invoice))

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        """Every save, edit and deletion of this invoice, newest first."""
        invoice = self.get_object()
        return Response(
            [
                {
                    "action": row.action,
                    "action_display": row.get_action_display(),
                    "actor": str(row.actor) if row.actor_id else None,
                    "at": row.at,
                    "totals": row.snapshot.get("totals"),
                }
                for row in invoice.history.select_related("actor")
            ]
        )

    # ---- working it out ----------------------------------------------------

    @action(detail=False, methods=["post"])
    def calculate(self, request):
        """"Bereken factuur": the totals and derived figures, as the server sees them.

        The editor shows totals as you type, worked out in the browser. This
        is the check: the browser compares its own figures with these and
        warns if they differ. Nothing is saved.
        """
        data = self._editor_body(request, check_duplicates=False)
        fields, lines, totals = prepare(data)
        return Response(
            {
                "totals": totals_as_json(totals),
                "vat_rate": str(fields["vat_rate"]),
                "pieces": fields["pieces"],
                "volume_m3": None if fields["volume_m3"] is None else str(fields["volume_m3"]),
                "volume_weight_kg": (
                    None if fields["volume_weight_kg"] is None else str(fields["volume_weight_kg"])
                ),
                "lines": [
                    {"kind": kind, "description": description, "amount": str(amount)}
                    for kind, description, amount in lines
                ],
            }
        )

    @action(detail=False, methods=["post"])
    def preview(self, request):
        """The PDF the form would produce, drawn without saving anything.

        Also what "Factuur downloaden als PDF" downloads for an unsaved form.
        Answered as base64 inside JSON so the dashboard's one request helper
        (JSON in, JSON out) can fetch it.

        When the form is for an invoice that already exists (?invoice=<id>),
        the preview carries that invoice's own number and wording.
        """
        invoice = None
        invoice_id = request.query_params.get("invoice", "")
        if invoice_id.isdigit():
            invoice = get_object_or_404(Invoice, pk=int(invoice_id), composed=True)

        data = self._editor_body(request, invoice=invoice, check_duplicates=False)
        fields, lines, totals = prepare(data, texts=invoice.texts if invoice else None)

        dated = data.get("invoice_date") or timezone.localdate()
        # A saved invoice keeps its own number; a new one shows the number the
        # person typed, or else the number it would get.
        number_text = (
            invoice.reference
            if invoice
            else (data.get("number") or InvoiceNumberSequence.peek(dated.year))
        )
        document = document_from_values(number_text, dated, fields, lines)
        content = render_document(document, SiteSettings.load())

        return Response(
            {
                "number": number_text,
                "totals": totals_as_json(totals),
                "pdf": base64.b64encode(content).decode("ascii"),
            }
        )

    # ---- saving ------------------------------------------------------------

    @action(detail=False, methods=["post"])
    def compose(self, request):
        """Save a new invoice written in the editor, and give it its number.

        The number is taken inside the same database transaction as the
        invoice: if anything below fails, the whole thing is rolled back -
        counter included - so a failed save never leaves a gap in the
        numbering.

        "pending_review" puts it in the queue, where approving it draws the
        PDF and sends it; "sent" approves it in the creator's name straight
        away, which draws and sends it the same way.
        """
        data = self._editor_body(request)
        package = data["package"]
        fields, lines, _ = prepare(data)
        dated = data.get("invoice_date") or timezone.localdate()
        # A number the person chose, or "" for "the next one".
        typed_number = data.get("number", "")

        try:
            with transaction.atomic():
                # Lock the shipment so two people saving an invoice for it at
                # the same moment queue up, then look for a duplicate again -
                # the serializer's check was before the lock.
                Package.objects.select_for_update().get(pk=package.pk)
                duplicate = Invoice.objects.filter(package=package).first()
                if duplicate is not None:
                    raise InvoiceAlreadyExists(duplicate)

                if typed_number:
                    # Checked again here, now the shipment is locked: another
                    # invoice may have taken this number a moment ago.
                    if Invoice.objects.filter(reference__iexact=typed_number).exists():
                        raise ValidationError({"number": ["That invoice number is already used by another invoice."]})
                    # Moves the counter up when the number is in our format,
                    # so the next invoice carries on after it.
                    reference = InvoiceNumberSequence.claim(dated.year, typed_number)
                else:
                    reference = InvoiceNumberSequence.take(dated.year)

                invoice = ensure_invoice_for_package(
                    package,
                    created_by=request.user,
                    invoice_date=dated,
                    reference=reference,
                    **fields,
                )
                _save_lines(invoice, lines)

                InvoiceHistory.objects.create(
                    invoice=invoice,
                    reference=invoice.reference,
                    action=InvoiceHistory.Action.CREATED,
                    actor=request.user,
                    snapshot=snapshot(invoice),
                )

                if data["status"] == Invoice.Status.SENT:
                    # Queues the drawing for after this transaction commits;
                    # the render task draws the PDF and sends it.
                    invoice.approve(request.user)
        except InvalidInvoiceTransition as exc:
            raise InvoiceLocked(str(exc)) from exc

        return Response(self._invoice_payload(invoice), status=http_status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        """Delete an invoice that has not been sent. Admins only.

        A sent invoice is in the customer's hands and in the books; it is
        corrected with a new (credit) invoice, never deleted. A deletion is
        written to InvoiceHistory with the invoice's number, so the gap it
        leaves in the numbering can be explained to an accountant.
        """
        if not request.user.is_admin:
            raise PermissionDenied("Only an admin can delete an invoice.")

        invoice = self.get_object()
        if invoice.status in (Invoice.Status.APPROVED, Invoice.Status.SENT):
            raise InvoiceLocked(
                "An approved or sent invoice cannot be deleted. Correct it with a "
                "credit invoice instead."
            )

        with transaction.atomic():
            InvoiceHistory.objects.create(
                invoice=invoice,
                reference=invoice.reference or "",
                action=InvoiceHistory.Action.DELETED,
                actor=request.user,
                snapshot=snapshot(invoice) if invoice.composed else {},
            )
            invoice.delete()

        return Response(status=http_status.HTTP_204_NO_CONTENT)
