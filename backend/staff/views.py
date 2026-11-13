"""The staff dashboard API, mounted at /api/staff/.

Everything here is behind IsStaff. The customer-facing API in accounts/ and
enquiries/ is scoped to the caller's own rows; these views are the deliberate
exception, so the permission class is the whole security story and is applied
once, on a shared base class, rather than remembered per view.
"""

import logging
import re
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import (
    Case,
    Count,
    DecimalField,
    IntegerField,
    OuterRef,
    ProtectedError,
    Q,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce, TruncDate
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework import status as http_status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.throttling import BaseThrottle, ScopedRateThrottle
from rest_framework.views import APIView

from accounts import floor as floor_pins
from accounts import twofactor
from accounts.emails import send_account_invite, send_email_changed_notice, send_sign_in_code
from accounts.events import record_event
from accounts.models import (
    FloorEvent,
    InvalidShipmentTransition,
    Package,
    PackageDocument,
    PackageEvent,
    ShipmentLocked,
    TwoFactorAuditEvent,
    WarehousePin,
)
from accounts.reauth import require_recent_reauth
from accounts.signin_codes import CodeNotAllowed, code_goes_on_screen, issue_code
from accounts.views import ShipmentChangeRefused
from accounts.warehouse import follow_status
from bookings.models import Booking, BookingAttachment, BookingProduct
from bookings.serializers import (
    StaffBookingSerializer,
    StaffProductCheckSerializer,
    StaffProductSerializer,
)
from bookings.shipments import SendRefused, follow_booking_status, number_and_send, send_to_warehouse
from bookings.views import attachment_response
from docreview.models import DocumentJob
from enquiries.models import ContactMessage, QuoteRequest
from enquiries.replies import send_quote_reply, send_reply
from invoicing.errors import InvoiceAlreadyExists
from invoicing.models import InvalidInvoiceTransition, Invoice
from invoicing.pdf import invoice_number, render_invoice_pdf
from invoicing.serializers import (
    InvoiceCreateSerializer,
    InvoiceDocumentSerializer,
    InvoiceRejectSerializer,
    StaffInvoiceSerializer,
)
from invoicing.services import ensure_invoice_for_package
from notifications.services import notify_shipment_status

from .invoice_editor import InvoiceEditorMixin
from .permissions import IsAdmin, IsStaff, IsStaffOrWarehouseManager, IsWarehouseManager
from .serializers import (
    StaffAddressWriteSerializer,
    StaffContactMessageSerializer,
    StaffCustomerCreateSerializer,
    StaffCustomerSerializer,
    StaffPackageSerializer,
    StaffQuoteRequestSerializer,
    StaffRoleSerializer,
    StaffSignInCodeSerializer,
)

logger = logging.getLogger(__name__)

# The warehouse's own accounts: what happens to them is written to the
# warehouse audit trail (FloorEvent), which managers read in the activity log.
WAREHOUSE_ROLES = ("warehouse", "manager")
# Roles that can manage other people or the office. Opening an account with
# one of these asks the admin to confirm their password first.
POWER_ROLES = ("admin", "office", "manager")

User = get_user_model()

# Everyone who works here, as opposed to everyone who ships with us. The four
# roles that are not Customer, in the order somebody reads them when deciding
# how much access an account has. The Workers page lists exactly these, and
# ?role=worker on the customers list is the filter it asks for.
WORKER_ROLES = (
    User.Role.ADMIN,
    User.Role.OFFICE,
    User.Role.MANAGER,
    User.Role.WAREHOUSE,
    User.Role.DRIVER,
)

# How far back "recent" reaches on the overview, and what the range picker
# above the chart offers. An allow-list rather than any number the caller
# sends: ?days=100000 is one query that reads the whole table.
RECENT_DAYS = 30
ALLOWED_RANGES = (7, 30, 90)

# Rows in each of the overview's activity lists.
RECENT_LIMIT = 5


def counts_by(queryset, field):
    """`{value: count}` for one column, in a single grouped query.

    A dict comprehension over the choices would run one COUNT per status;
    this runs one for the whole table.
    """
    rows = queryset.values(field).annotate(total=Count("id"))
    return {row[field]: row["total"] for row in rows}


def counts_per_day(queryset, since):
    """`{date: count}` of rows created on each day, in one grouped query.

    The database does the grouping. Pulling the rows out and counting them in
    Python would work for a demo database and stop working for a real one.
    """
    rows = (
        queryset.filter(created_at__gte=since)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(total=Count("id"))
    )
    return {row["day"]: row["total"] for row in rows}


def previous_count(queryset, field, since, days):
    """How many rows landed in the period immediately before this one.

    What makes the overview's arrows mean something. "32 quotes" says nothing
    on its own; "32, up from 24" is the sentence somebody actually wants, and
    it has to be measured rather than guessed — a delta invented in the
    browser from a single number is a decoration, not a figure.

    The window is the same length as the current one and ends where it begins,
    so the two are comparable: 30 days against the 30 before them.
    """
    started = since - timedelta(days=days)
    return queryset.filter(
        **{f"{field}__gte": started, f"{field}__lt": since}
    ).count()


def trend(queryset, field, since, days):
    """`{"current": n, "previous": n}` for one metric, for the arrow above it.

    The percentage is left to the caller that displays it. A change from 0 to
    3 has no percentage — it is "3 where there were none" — and deciding that
    in the browser, where the wording lives, beats sending an infinity here.
    """
    return {
        "current": queryset.filter(**{f"{field}__gte": since}).count(),
        "previous": previous_count(queryset, field, since, days),
    }


def daily_series(since, days, **querysets):
    """One row per day, including the days on which nothing happened.

    Built from the calendar rather than from the rows that exist, so a quiet
    Tuesday is a zero on the chart instead of a gap the line skips over.
    """
    per_day = {name: counts_per_day(qs, since) for name, qs in querysets.items()}
    start = since.date()

    return [
        {
            "date": (day := start + timedelta(days=offset)).isoformat(),
            **{name: counts.get(day, 0) for name, counts in per_day.items()},
        }
        for offset in range(days)
    ]


class StaffViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """List, read and update — never create or destroy.

    Nothing in the back office should be able to delete a customer's
    submission or a shipment record: staff mark things handled or move them
    along, and the row stays as evidence of what happened.

    Adds the three query parameters every list here needs:

        ?search=      substring match across `search_fields`
        ?<filter>=    exact match on a column named in `filter_fields`
        ?ordering=    one of `ordering_fields`, `-` for descending

    Hand-rolled rather than pulling in django-filter: it is three parameters
    against an allow-list, and an allow-list is what keeps `?ordering=` from
    becoming a way to sort by, and so probe, a password hash.
    """

    permission_classes = [IsStaff]

    search_fields = ()
    filter_fields = ()
    ordering_fields = ()

    def filter_queryset(self, queryset):
        params = self.request.query_params

        for field in self.filter_fields:
            value = params.get(field)
            if value:
                queryset = queryset.filter(**{field: value})

        search = params.get("search", "").strip()
        if search and self.search_fields:
            matches = Q()
            for field in self.search_fields:
                matches |= Q(**{f"{field}__icontains": search})
            queryset = queryset.filter(matches)

        ordering = params.get("ordering", "").strip()
        if ordering.lstrip("-") in self.ordering_fields:
            queryset = queryset.order_by(ordering)

        return queryset


class QuoteRequestViewSet(StaffViewSet):
    """Quote requests from the destination pages."""

    serializer_class = StaffQuoteRequestSerializer
    queryset = QuoteRequest.objects.all()

    search_fields = ("first_name", "last_name", "email", "message", "destination")
    filter_fields = ("status", "destination")
    ordering_fields = ("created_at", "updated_at", "status", "destination")

    def get_queryset(self):
        # The replies (and who wrote them) in one extra query for the page.
        return super().get_queryset().prefetch_related("replies__author")

    # The same ceiling as a contact message's reply.
    MAX_REPLY_LENGTH = 10_000

    @action(detail=True, methods=["post"])
    def reply(self, request, pk=None):
        """E-mail an answer (the quote) to whoever asked. Body: {"body": "..."}.

        The same contract as ContactMessageViewSet.reply: 201 with the whole
        request whether or not the e-mail went out - the newest reply's `sent`
        says which. A request still "New" becomes "Quote sent" once the
        e-mail is out. See enquiries/replies.py.
        """
        quote = self.get_object()
        body = str(request.data.get("body", "")).strip()
        if not body:
            return Response({"body": ["Write a reply first."]}, status=http_status.HTTP_400_BAD_REQUEST)
        if len(body) > self.MAX_REPLY_LENGTH:
            return Response(
                {"body": [f"A reply can be at most {self.MAX_REPLY_LENGTH} characters."]},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        send_quote_reply(quote, request.user, body)
        quote = self.get_queryset().get(pk=quote.pk)
        return Response(self.get_serializer(quote).data, status=http_status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="draft-reply")
    def draft_reply(self, request, pk=None):
        """POST: a first draft of the answer, written by AI. Nothing is sent or saved.

        Prices are left as [price] for staff to fill in. See assistant/drafts.py.
        """
        from assistant.drafts import DraftError, draft_quote_reply

        quote = self.get_object()
        try:
            body = draft_quote_reply(quote)
        except DraftError:
            logger.exception("Drafting a reply to quote request %s failed", quote.pk)
            return Response(
                {"detail": "The AI could not write a draft just now."},
                status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"body": body})

    @action(detail=True, methods=["get"])
    def file(self, request, pk=None):
        """Stream the attachment a visitor sent with their quote request.

        The same arrangement as the invoice routes, and here for the same two
        reasons. The link the dashboard used to get was the file's MEDIA_URL,
        which Django serves only while DEBUG is on — so opening an attachment
        worked locally and answered 404 on the deployed site. And publishing
        MEDIA_ROOT to make it work would have made every attachment fetchable
        by anyone who could guess a name.

        So the file is served here, where IsStaff has already been checked by
        DRF. Nothing narrows it further: staff may read every quote request,
        which is the job.

        as_attachment, and the content type is not guessed. This is the one
        kind of file on the site that arrives from a stranger, so it is handed
        to the browser as an opaque download rather than as something to
        render — a rendered attachment is a stored-XSS hole wearing a
        paperclip. SECURE_CONTENT_TYPE_NOSNIFF stops the browser from
        second-guessing that.
        """
        quote = self.get_object()

        if not quote.file:
            raise Http404("This quote request has no attachment.")

        try:
            handle = quote.file.open("rb")
        except FileNotFoundError as error:
            raise Http404("This attachment is missing.") from error

        return FileResponse(
            handle,
            as_attachment=True,
            filename=Path(quote.file.name).name,
            content_type="application/octet-stream",
        )


class ContactMessageViewSet(StaffViewSet):
    """Messages from the contact form."""

    serializer_class = StaffContactMessageSerializer
    # The replies (and who wrote them) are loaded in one extra query for the
    # whole page, rather than one query per message.
    queryset = ContactMessage.objects.prefetch_related("replies__author")

    # ai_topic / ai_urgency: what the AI sorted the message as (enquiries/sorting.py).
    search_fields = ("name", "email", "subject", "message", "ai_summary")
    filter_fields = ("subject", "ai_topic", "ai_urgency")
    ordering_fields = ("created_at", "handled", "subject")

    # ?ordering=urgency: urgent first, then normal (and not yet sorted), then
    # what can wait - newest first within each.
    URGENCY_RANK = Case(
        When(ai_urgency=ContactMessage.Urgency.HIGH, then=Value(0)),
        When(ai_urgency=ContactMessage.Urgency.LOW, then=Value(2)),
        default=Value(1),
        output_field=IntegerField(),
    )

    @action(detail=False, methods=["post"])
    def sort(self, request):
        """POST: sort the messages the AI has not sorted yet (a batch at a time).

        The Messages page calls this when it shows unsorted messages - on a
        site without a background worker that is when they get sorted.
        Answers {"sorted": n}; 0 when the AI is off. See enquiries/sorting.py.
        """
        from enquiries.sorting import sort_unsorted

        return Response({"sorted": sort_unsorted()})

    # The longest reply accepted. A real answer is a few paragraphs; this is
    # only a ceiling against a paste gone wrong.
    MAX_REPLY_LENGTH = 10_000

    @action(detail=True, methods=["post"])
    def reply(self, request, pk=None):
        """E-mail an answer to whoever sent this message.

        Body: {"body": "Dear Anna, ..."}

        Answers 201 with the whole message (its `replies` list now ends with
        this one) whether or not the e-mail went out: the reply is saved
        either way. The page reads the last reply's `sent` to know which
        happened. Only an empty or far too long text is refused (400).
        See enquiries/replies.py for the steps.
        """
        message = self.get_object()
        body = str(request.data.get("body", "")).strip()

        if not body:
            return Response(
                {"body": ["Write a reply first."]}, status=http_status.HTTP_400_BAD_REQUEST
            )
        if len(body) > self.MAX_REPLY_LENGTH:
            return Response(
                {"body": [f"A reply can be at most {self.MAX_REPLY_LENGTH} characters."]},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        send_reply(message, request.user, body)

        # Read again so `handled` and the new reply are both in the answer.
        message = self.get_queryset().get(pk=message.pk)
        return Response(self.get_serializer(message).data, status=http_status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="draft-reply")
    def draft_reply(self, request, pk=None):
        """POST: a first draft of the answer, written by AI. Nothing is sent or saved.

        Answers {"body": "Dear Anna, ..."} for the reply box, where staff
        edit it and press Send (the `reply` action above). 503 when the AI is
        not set up or failed. See assistant/drafts.py.
        """
        from assistant.drafts import DraftError, draft_reply

        message = self.get_object()
        try:
            body = draft_reply(message)
        except DraftError:
            logger.exception("Drafting a reply to contact message %s failed", message.pk)
            return Response(
                {"detail": "The AI could not write a draft just now."},
                status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"body": body})

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)

        # `handled` is a boolean, so it cannot go through filter_fields —
        # Django would read the string "false" as True.
        handled = self.request.query_params.get("handled")
        if handled in {"true", "false"}:
            queryset = queryset.filter(handled=handled == "true")

        if self.request.query_params.get("ordering") == "urgency":
            queryset = queryset.annotate(urgency_rank=self.URGENCY_RANK).order_by("urgency_rank", "-created_at")

        return queryset


class PackageViewSet(StaffViewSet):
    """Every customer's shipments, not just the caller's.

    `customs-check` (below) says whether a shipment's paperwork is ready for
    customs on the island - see staff/customs_check.py.

    Staff may do more to a shipment than a customer can, but not everything:
    once it is in transit it is locked to them too, because from that point
    the row is a record of what was sent rather than a description of what is
    going to be. See Package.LOCKED_STATUSES.
    """

    serializer_class = StaffPackageSerializer
    # select_related, or rendering a page of 25 packages costs 25 extra
    # queries to fetch each owner for the customer block; prefetch, or another
    # 25 for the files the customer has attached to each one.
    queryset = (
        # select_related, or rendering 25 packages costs 25 queries for the
        # owner and 25 more to find out whether each has an invoice;
        # prefetch, or another 25 for the files attached to them.
        # delivery_address too: `destination` reads its country on every row.
        Package.objects.select_related("user", "invoice", "delivery_address")
        .prefetch_related("documents__uploaded_by", "documents__customer", "warehouse_measurements__worker")
        .all()
    )

    search_fields = (
        "tracking_number",
        # The office's own shipment number (CIT-SE-006648), so the invoice
        # editor can find a shipment by the number on the paperwork.
        "booking__shipping_number",
        "description",
        "user__first_name",
        "user__last_name",
        "user__email",
    )
    # `user` is what the Add invoice form uses to show only the selected
    # customer's shipments. It narrows the list the admin picks from; it is
    # not what makes the pairing safe - InvoiceCreateSerializer re-checks the
    # shipment against the customer on the way back in, because a filtered
    # dropdown is a convenience and a request body is not evidence.
    filter_fields = ("status", "user")
    ordering_fields = ("created_at", "updated_at", "status", "tracking_number")

    @action(detail=True, methods=["get"], url_path="customs-check")
    def customs_check(self, request, pk=None):
        """GET: is this shipment's paperwork ready for customs? (staff/customs_check.py)

        The rule checks, always. With ?ai=1 also a few AI-written notes on
        whether the documents match what is declared ("" when the AI is off).
        Reads only; nothing is changed.
        """
        from . import customs_check

        package = self.get_object()
        data = customs_check.gather(package)
        result = customs_check.check(package, data)
        if request.query_params.get("ai") == "1":
            result["ai_notes"] = customs_check.ai_notes(result, package, data)
        return Response(result)

    @action(detail=True, methods=["post"])
    def invoice(self, request, pk=None):
        """Raise the invoice for a shipment that has no invoice yet.

        Normally an invoice appears by itself: marking a package paid through
        this dashboard raises one, in perform_update below. That covers a
        package that *becomes* paid here, and nothing else — a row seeded
        straight into `paid`, imported from elsewhere, or set in the Django
        admin never passes through that transition and so never gets one.
        Those shipments had no route to an invoice at all until this action:
        the queue was empty, and the queue is where every other invoice
        control lives.

        Idempotent, because ensure_invoice_for_package is: pressing it twice
        answers with the same invoice rather than raising a second one, and a
        review already under way is left alone.
        """
        package = self.get_object()

        # Anything from PAID onwards. QUOTED is a customer still holding a
        # quote they have not acted on, and billing for it would be inventing
        # a debt; CANCELLED is not owed by anyone.
        if package.status not in Package.PAID_STATUSES:
            raise ValidationError(
                "An invoice can only be raised for a shipment that has been "
                f"paid for. This one is {package.get_status_display()}."
            )

        invoice = ensure_invoice_for_package(package)

        return Response(
            StaffInvoiceSerializer(invoice, context={"request": request}).data,
            status=http_status.HTTP_201_CREATED,
        )

    def perform_update(self, serializer):
        """Stamp the shipping dates when the status says they happened, raise
        the invoice when the package is marked paid, and tell the customer.

        The dates are read-only over the API on purpose: they record when a
        thing actually happened, and deriving them from the status is what
        keeps them honest. Only ever set, never cleared — moving a package back
        a step is a correction, and forgetting it shipped at all would lose
        information the row already had.
        """
        package = serializer.instance
        previous_status = package.status
        previous_freight = package.freight
        status = serializer.validated_data.get("status", previous_status)
        stamps = {}

        # The serializer has already asked this of the payload and answered
        # with a 400 naming the field. Asked here of the object as well, so
        # that a caller reaching perform_update by some other route still
        # meets the rule, and so that a move nobody can blame a field for is
        # a 409 instead.
        try:
            package.check_transition(status)
        except InvalidShipmentTransition as exc:
            raise ShipmentChangeRefused(str(exc)) from exc

        if status == Package.Status.IN_TRANSIT and package.shipped_at is None:
            stamps["shipped_at"] = timezone.now()
        if status == Package.Status.DELIVERED and package.delivered_at is None:
            stamps["delivered_at"] = timezone.now()

        # atomic, so a package is never left marked paid with no invoice behind
        # it: if raising the invoice fails, the status change goes back too.
        try:
            with transaction.atomic():
                package = serializer.save(**stamps)

                # Sea or air is the office's decision, made here or on the
                # intake sheet. The sheets of this package follow at once, so
                # the warehouse reads the same answer on its own screen.
                if package.freight != previous_freight:
                    package.intake_sheets.update(
                        freight=package.freight, updated_at=timezone.now()
                    )

                # The order's own record of the move, written before anything that
                # follows from it so the history reads in the order it happened.
                # Guarded on an actual change for the same reason the invoice is:
                # a corrected weight is not progress and does not belong on a
                # timeline as though it were.
                if status != previous_status:
                    record_event(
                        package,
                        PackageEvent.Kind.STATUS_CHANGED,
                        actor=self.request.user,
                        from_status=previous_status,
                        to_status=status,
                    )
                    # Gone from the building: the warehouse board follows, or
                    # it would show the shipment as packed and soon overdue.
                    follow_status(package, actor=self.request.user)

                # Entering PAID is the event, not being in it. Without the
                # before-and-after comparison, every later edit to a paid package —
                # a corrected weight, a note — would re-run this.
                if status == Package.Status.PAID and previous_status != status:
                    ensure_invoice_for_package(package)

                # Every status change is news, not only the one that raises an
                # invoice. Inside the transaction so a package is never left moved
                # with no record of the customer having been told; the e-mail
                # itself is queued on commit, so nothing is sent for a change that
                # is about to be rolled back. Returns None when the status did not
                # actually change, which is what keeps a corrected weight or an
                # added note from being announced as progress.
                notify_shipment_status(package, previous_status)
        except (ShipmentLocked, InvalidShipmentTransition) as exc:
            # Package.save() had the last word - a bulk edit, a stale
            # form, anything that got past the two checks above. The
            # atomic block is gone with the exception, so the status
            # change, the event, the invoice and the queued e-mail all
            # go back together and the caller is told why.
            raise ShipmentChangeRefused(str(exc)) from exc


class BookingProductViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """The products customers listed on their bookings, for the office to check.

    GET ?booking=<id> lists one booking's products; PATCH changes only the
    office's half - the checked webshop price, the status and the internal
    notes (StaffProductCheckSerializer). What the customer reported, the
    price included, cannot be changed here.

    Behind IsStaff like the rest of the dashboard: a warehouse account or a
    customer gets a 403, whatever the page shows."""

    permission_classes = [IsStaff]
    queryset = BookingProduct.objects.select_related(
        "order", "screenshot", "verified_by"
    )

    def get_serializer_class(self):
        if self.action in ("update", "partial_update"):
            return StaffProductCheckSerializer
        return StaffProductSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        booking = self.request.query_params.get("booking")
        if booking is not None:
            if not booking.isdigit():
                raise ValidationError({"booking": "Expected a booking id."})
            queryset = queryset.filter(booking_id=int(booking))
        return queryset

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        product = self.get_object()
        check = StaffProductCheckSerializer(product, data=request.data, partial=partial)
        check.is_valid(raise_exception=True)

        changes = check.validated_data
        # Who checked, and when: stamped whenever the price or the status
        # changes, not for a note alone.
        stamp = {}
        if any(
            key in changes and changes[key] != getattr(product, key)
            for key in ("verified_price_eur", "verification_status")
        ):
            stamp = {"verified_by": request.user, "verified_at": timezone.now()}
        check.save(**stamp)
        return Response(StaffProductSerializer(product).data)


class BookingViewSet(StaffViewSet):
    """Booking forms, as submitted by customers.

    Only the office half is writable — see StaffBookingSerializer. What the
    sender declared stays as they declared it.
    """

    serializer_class = StaffBookingSerializer
    queryset = Booking.objects.all()

    search_fields = (
        "shipping_number",
        "sender_first_name",
        "sender_last_name",
        "sender_email",
        "sender_phone",
        "recipient_first_name",
        "recipient_last_name",
        "contents",
    )
    filter_fields = ("status", "destination", "freight")
    ordering_fields = ("created_at", "updated_at", "status", "shipping_number")

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related("user", "package", "package__invoice")
            .prefetch_related(
                "orders__screenshots",
                "orders__products__screenshot",
                "orders__products__verified_by",
                # Each order's courier tracking (tracking app).
                "orders__carrier_shipments__carrier",
                "orders__carrier_shipments__events",
                # The warehouse's measurements shown on each booking - see
                # bookings.serializers._warehouse. Without these, every
                # booking on the page would cost four more queries.
                "intake_sheets__measurements",
                "intake_sheets__created_by",
                # Who pressed "received" / "request invoice": names on the page.
                "orders__received_by",
                "orders__invoice_requested_by",
                "orders__confirmation_requested_by",
                "orders__products__received_by",
                "package__intake_sheets__measurements",
                "package__intake_sheets__created_by",
                "package__warehouse_measurements__worker",
                "package__photos",
            )
        )

    def perform_update(self, serializer):
        """Save, then keep the booking's shipment in step with it.

        Changing the status from New to Confirmed (or further) creates the
        shipment the customer then sees under "My shipments"; Shipped moves
        it to In transit ("On the way"), Cancelled to Cancelled. See
        bookings/shipments.py.

        And giving it a shipping number sends it to the warehouse floor, to be
        received and measured before the invoice is made (send_to_warehouse).
        """
        booking = serializer.save()
        follow_booking_status(booking, actor=self.request.user)
        send_to_warehouse(booking, actor=self.request.user)

    # ---- "We have received it": the office's buttons ---------------------
    #
    # POST {"received": true} marks a whole store order, or one product, as
    # arrived at the warehouse; {"received": false} undoes a mistake. The
    # customer then sees it as "Ontvangen" (warehouse/receipts.py).
    #
    # ONLY AN ADMIN may: checked here on the server, not only by hiding the
    # button. Other office accounts get a 403. Both answer the whole booking
    # again, so the dashboard can redraw it in one go.

    @action(
        detail=True,
        methods=["post"],
        url_path=r"orders/(?P<order_id>[0-9]+)/received",
        url_name="order-received",
    )
    def order_received(self, request, pk=None, order_id=None):
        booking = self.get_object()
        order = get_object_or_404(booking.orders, pk=order_id)
        return self._mark_received(request, booking, order)

    @action(
        detail=True,
        methods=["post"],
        url_path=r"products/(?P<product_id>[0-9]+)/received",
        url_name="product-received",
    )
    def product_received(self, request, pk=None, product_id=None):
        booking = self.get_object()
        product = get_object_or_404(booking.products, pk=product_id)
        return self._mark_received(request, booking, product)

    # ---- "We are missing the invoice": ask the customer for it ----------------
    #
    # POST: tells the customer (a notification and, if they allow e-mail, an
    # e-mail) that the invoice of this store order is missing and asks them to
    # add it to their booking. Any office account may do this, not only admins:
    # it is a question to the customer, not a change to the books.
    #
    # Refused, with a sentence the page shows, when:
    #   - the order already has an invoice (nothing to ask for);
    #   - the booking has no customer account (there is nobody to notify);
    #   - the booking is shipped or cancelled (the customer can no longer add
    #     documents, so asking would be pointless);
    #   - the customer was already asked in the last 24 hours (no pestering).

    INVOICE_REQUEST_COOLDOWN = timedelta(hours=24)

    @action(
        detail=True,
        methods=["post"],
        url_path=r"orders/(?P<order_id>[0-9]+)/request-invoice",
        url_name="order-request-invoice",
    )
    def request_invoice(self, request, pk=None, order_id=None):
        """POST: ask the customer to add the INVOICE of this store order."""
        return self._request_document(request, pk, order_id, "invoice")

    @action(
        detail=True,
        methods=["post"],
        url_path=r"orders/(?P<order_id>[0-9]+)/request-confirmation",
        url_name="order-request-confirmation",
    )
    def request_confirmation(self, request, pk=None, order_id=None):
        """POST: ask the customer to upload the webshop's ORDER CONFIRMATION of
        this store order ("Request Order Confirmation").

        Exactly the same rules as the invoice request - one shared helper below.
        The confirmation stays OPTIONAL: nothing about the booking waits for it.
        """
        return self._request_document(request, pk, order_id, "order_confirmation")

    def _request_document(self, request, pk, order_id, which):
        """Ask the customer for one kind of document: the invoice or the order
        confirmation. Shared, so the two buttons can never behave differently.

        Step by step:
          1. Find the booking and its store order.
          2. Refuse when asking makes no sense: the document is already there,
             the booking has no customer account, or it is shipped/cancelled.
          3. Record WHEN and WHO asked - but only if nobody asked in the last
             24 hours. This is one conditional UPDATE, so two quick presses (or
             two colleagues at once) send ONE request, not two.
          4. Tell the customer (bell + e-mail). A problem there never undoes
             step 3: the request is recorded either way.
          5. Answer the whole booking, so the page redraws in one go.
        """
        from bookings.models import BookingOrder
        from notifications import services

        # What differs between the two documents, in one place.
        wanted = {
            "invoice": {
                "kind": BookingAttachment.Kind.INVOICE,
                "at": "invoice_requested_at",
                "by": "invoice_requested_by",
                "notify": services.notify_invoice_requested,
                "article": "an invoice",
                "this": "this invoice",
            },
            "order_confirmation": {
                "kind": BookingAttachment.Kind.ORDER_CONFIRMATION,
                "at": "confirmation_requested_at",
                "by": "confirmation_requested_by",
                "notify": services.notify_confirmation_requested,
                "article": "an order confirmation",
                "this": "this order confirmation",
            },
        }[which]

        booking = self.get_object()
        order = get_object_or_404(booking.orders, pk=order_id)

        if order.screenshots.filter(kind=wanted["kind"]).exists():
            raise ValidationError({"detail": [f"This order already has {wanted['article']}."]})
        if booking.user_id is None:
            raise ValidationError(
                {
                    "detail": [
                        "This booking was sent without an account, so there is nobody to notify. "
                        "Contact the sender by e-mail."
                    ]
                }
            )
        if booking.status in (Booking.Status.SHIPPED, Booking.Status.CANCELLED):
            raise ValidationError(
                {"detail": ["This booking is shipped or cancelled; the customer can no longer add documents."]}
            )

        now = timezone.now()
        asked_at, asked_by = wanted["at"], wanted["by"]
        changed = (
            BookingOrder.objects.filter(pk=order.pk)
            .filter(
                Q(**{f"{asked_at}__isnull": True})
                | Q(**{f"{asked_at}__lt": now - self.INVOICE_REQUEST_COOLDOWN})
            )
            .update(**{asked_at: now, asked_by: request.user})
        )
        if not changed:
            raise ValidationError(
                {"detail": [f"The customer was already asked for {wanted['this']} in the last 24 hours."]}
            )

        try:
            order.refresh_from_db()
            wanted["notify"](order)
        except Exception:  # noqa: BLE001
            logger.exception("Could not notify the customer about the missing %s of order %s.", which, order.pk)

        fresh = self.get_queryset().get(pk=booking.pk)
        return Response(self.get_serializer(fresh).data)

    def _mark_received(self, request, booking, row):
        """Set or clear received_at / received_by on a store order or a product.

        Step by step:
          1. Only an admin - anybody else is refused (403).
          2. "received" must be true or false.
          3. True: stamp now and who. False: empty both again.
          4. Answer the booking as the dashboard shows it.
        """
        if not request.user.is_admin:
            raise PermissionDenied("Only an admin can mark an order as received.")
        received = request.data.get("received")
        if not isinstance(received, bool):
            raise ValidationError({"received": ["Send true or false."]})

        model = type(row)
        if received:
            # A conditional UPDATE: it changes the row only if it was NOT
            # received yet, so two quick presses (a double-click, two admins)
            # produce one change - and so exactly one notification below.
            changed = model.objects.filter(pk=row.pk, received_at__isnull=True).update(
                received_at=timezone.now(), received_by=request.user
            )
            if changed:
                # Tell the customer (bell + e-mail, if they allow it). A problem
                # here must never undo the press, so it is only logged.
                try:
                    from notifications.services import notify_item_received

                    row.refresh_from_db()
                    notify_item_received(row)
                except Exception:  # noqa: BLE001
                    logger.exception("Could not notify the customer about received %s %s.", model.__name__, row.pk)
        else:
            model.objects.filter(pk=row.pk).update(received_at=None, received_by=None)

        # Read again through the queryset, so every prefetch is fresh.
        fresh = self.get_queryset().get(pk=booking.pk)
        return Response(self.get_serializer(fresh).data)

    @action(detail=True, methods=["post"], url_path="send-to-warehouse", url_name="send-to-warehouse")
    def send_to_warehouse_now(self, request, pk=None):
        """POST: number the booking (next PLSM-number, unless it has one) and
        send it to the warehouse with its intake sheet. See
        bookings.shipments.number_and_send."""
        booking = self.get_object()
        try:
            number_and_send(booking, actor=request.user)
        except SendRefused as refusal:
            raise ValidationError({"detail": str(refusal)}) from refusal
        return Response(self.get_serializer(self.get_queryset().get(pk=booking.pk)).data)

    @action(
        detail=True,
        methods=["get"],
        url_path=r"attachments/(?P<attachment_id>[0-9]+)",
        url_name="attachment",
    )
    def attachment(self, request, pk=None, attachment_id=None):
        """One of the customer's screenshots or photos on this booking."""
        attachment = get_object_or_404(
            BookingAttachment, pk=attachment_id, booking_id=self.get_object().pk
        )
        return attachment_response(attachment)


class InvoiceTransitionRefused(APIException):
    """409 rather than 400.

    The request was well formed and the caller was allowed to make it; the
    invoice simply is not in a state where the move makes sense — usually
    because somebody else got there first. 400 would tell the React app to
    highlight a bad field, and there isn't one to highlight.
    """

    status_code = http_status.HTTP_409_CONFLICT
    default_detail = "This invoice is not in a state where that is allowed."


class InvoiceViewSet(
    InvoiceEditorMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """The invoice review queue, and the form that raises one by hand.

    Create, read and two actions - but still no update. An invoice's status is
    not a field staff assign, it is the result of a transition, so a PATCH-able
    status would be a way around the state machine and there is no update route
    at all. StaffInvoiceSerializer is read-only end to end; POST goes through
    InvoiceCreateSerializer, which is a plain Serializer and writes nothing by
    itself - see `create` below for what actually happens.

    Creating here does not replace the automatic path. An invoice still appears
    by itself when a shipment is marked paid, through
    ensure_invoice_for_package; this is for the shipment that never went
    through that transition and has no invoice, where the office has the
    document already and wants it on the customer's profile.

    Paginated by the project default (PageNumberPagination, 25 a page), so
    ?page= works here like everywhere else in the dashboard.
    """

    serializer_class = StaffInvoiceSerializer
    # IsStaff, the same class the rest of the dashboard uses. It is checked by
    # DRF before the handler runs, on every request including the two actions
    # below, and it requires an authenticated, active, is_staff account — so a
    # signed-in customer POSTing straight to
    # /api/staff/invoices/3/approve/ gets a 403 and never reaches this code.
    # The React app hiding the button is not what stops them; this is.
    permission_classes = [IsStaff]

    # The queue is the default view. Any other status has to be asked for by
    # name, and only from this list — the same allow-list habit as ?ordering=.
    DEFAULT_STATUS = Invoice.Status.PENDING_REVIEW

    # What ?search= looks in. An invoice is found by the shipment it is for or
    # by whose it is; there is nothing else on the row a person would type.
    SEARCH_FIELDS = (
        "package__tracking_number",
        "package__user__first_name",
        "package__user__last_name",
        "package__user__email",
    )

    # An invoice reference is INV-<year>-<zero-padded pk>, derived rather than
    # stored - see invoicing.pdf.invoice_number - so there is no column to
    # search for it. Typing one off a document is still how somebody looks an
    # invoice up, so the digits at the end are pulled out and matched against
    # the primary key: "INV-2026-00007", "2026-00007" and "7" all find
    # invoice 7. Bounded to nine digits, so a long string of them cannot be
    # turned into an integer nobody wants to compare against.
    INVOICE_REFERENCE = re.compile(r"^(?:inv[-\s]*)?(?:\d{4}[-\s]*)?0*(\d{1,9})$")

    def base_queryset(self):
        # select_related, or a page of 25 invoices costs 25 extra queries for
        # the tracking number and another 25 for the customer.
        return Invoice.objects.select_related(
            "package",
            "package__user",
            "package__delivery_address",
            "reviewed_by",
            "created_by",
        ).prefetch_related("lines")

    def get_serializer_class(self):
        # The read serializer is read-only end to end, which is what keeps a
        # PATCH from moving the status. The write one is a different shape
        # entirely - a customer, a shipment and a file, none of which are
        # columns on the row.
        if self.action == "create":
            return InvoiceCreateSerializer
        return StaffInvoiceSerializer

    def get_queryset(self):
        queryset = self.base_queryset()

        # Only the list is narrowed. A detail route addresses one known invoice,
        # and filtering there would answer 404 for an invoice that plainly
        # exists — an approve on an already-approved invoice has to come back as
        # a refusal, not as "no such thing".
        if self.action != "list":
            return queryset

        wanted = self.request.query_params.get("status", self.DEFAULT_STATUS)
        if wanted == "all":
            pass
        elif wanted in Invoice.Status.values:
            queryset = queryset.filter(status=wanted)
        else:
            queryset = queryset.filter(status=self.DEFAULT_STATUS)

        # One customer's invoices, for the Customer filter on the page. An
        # id rather than a name: two customers can share a name, and the
        # dropdown already knows which row it means.
        customer = self.request.query_params.get("customer", "").strip()
        if customer.isdigit():
            queryset = queryset.filter(package__user_id=int(customer))

        search = self.request.query_params.get("search", "").strip()
        if search:
            matches = Q()
            for field in self.SEARCH_FIELDS:
                matches |= Q(**{f"{field}__icontains": search})

            # Typing the reference off a document is the most natural way to
            # look an invoice up, so it is matched even though there is no
            # column holding it.
            reference = self.INVOICE_REFERENCE.match(search.lower())
            if reference:
                matches |= Q(pk=int(reference.group(1)))

            queryset = queryset.filter(matches)

        return queryset

    # The create route takes a file, so it takes a multipart body. The rest
    # of the dashboard is JSON and stays that way; DRF's defaults accept both,
    # and this is stated only so the reason is written down.
    def get_parsers(self):
        if getattr(self, "action", None) == "create":
            return [MultiPartParser(), FormParser()]
        return super().get_parsers()

    def create(self, request, *args, **kwargs):
        """Raise an invoice for a shipment, with the document already in hand.

        The order of what follows matters. The pairing of customer to shipment
        is checked first, by the serializer, against the stored rows and not
        against anything the request claimed - that check is the reason this
        endpoint exists, and everything else is bookkeeping around it. Only
        then is the file written, and only then does the invoice move.

        The status the form asked for decides how far it goes:

          pending_review - the row is created and the document is stored, and
              it waits in the queue like any other. Somebody still has to
              approve it, which is the point of asking for review.

          approved - approved in the creator's name, so the audit trail
              answers who let it out of the building. The render task will
              find a document already attached and send it rather than drawing
              over it, which is what makes this a stable state rather than a
              race against a worker.

          sent - approved and sent in one step, and the customer has it. The
              same thing the `document` action does from the queue, for the
              same reason: attaching a document the office has already checked
              is the whole decision, and splitting it across two buttons would
              only invite the second one to be forgotten.
        """
        body = self.get_serializer(data=request.data)
        body.is_valid(raise_exception=True)

        package = body.validated_data["package"]
        wanted = body.validated_data["status"]
        upload = body.validated_data["pdf"]
        dated = body.validated_data.get("invoice_date") or timezone.localdate()

        # select_for_update on the shipment, so two admins filling in this form
        # for the same shipment at the same moment queue up instead of both
        # passing the duplicate check. The OneToOne would refuse the second one
        # anyway, with an IntegrityError and a 500; this makes it a sentence.
        try:
            with transaction.atomic():
                Package.objects.select_for_update().get(pk=package.pk)

                # Asked again inside the lock. The serializer checked it
                # too, and between those two moments another request can have
                # raised one - which is the race select_for_update is here to
                # settle.
                duplicate = Invoice.objects.filter(package=package).first()
                if duplicate is not None:
                    raise InvoiceAlreadyExists(duplicate)

                invoice = ensure_invoice_for_package(package, created_by=request.user)

                # Written straight rather than through a transition: the date
                # on the document is not part of the state machine, and it has
                # to be on the row before invoice_number reads the year off it.
                Invoice.objects.filter(pk=invoice.pk).update(invoice_date=dated)
                invoice.refresh_from_db()

                # Named the way the render task names its own output, so a
                # hand-attached document and a drawn one are indistinguishable
                # in storage. The uploaded file's own name is never used: it
                # comes from a browser and would put whatever it says on disk.
                filename = (
                    f"{invoice_number(invoice)}-{package.tracking_number}.pdf"
                )
                invoice.pdf.save(filename, upload, save=False)
                stored = invoice.pdf.name

                # Recorded before the transition, so an invoice that is
                # rejected further down still carries a description of the
                # file somebody attached to it.
                invoice.record_document(filename=filename, uploaded_by=request.user)

                if wanted == Invoice.Status.PENDING_REVIEW:
                    # No transition to make - ensure_invoice_for_package
                    # already left it here. Only the document is new.
                    Invoice.objects.filter(pk=invoice.pk).update(pdf=stored)
                    invoice.refresh_from_db()
                else:
                    invoice.approve(request.user)
                    if wanted == Invoice.Status.SENT:
                        # Notifies the customer. This is the invoice arriving.
                        invoice.mark_sent(stored)
                    else:
                        Invoice.objects.filter(pk=invoice.pk).update(pdf=stored)
                        invoice.refresh_from_db()
        except InvalidInvoiceTransition as exc:
            raise InvoiceTransitionRefused(str(exc)) from exc

        return Response(
            StaffInvoiceSerializer(
                self.base_queryset().get(pk=invoice.pk),
                context=self.get_serializer_context(),
            ).data,
            status=http_status.HTTP_201_CREATED,
        )

    def _transition(self, apply):
        """Run one transition and answer with the invoice as it now stands.

        select_for_update inside the transaction, so two reviewers pressing the
        button at the same moment queue up rather than interleave. The model's
        conditional UPDATE already makes a double approval impossible; the lock
        turns the loser's race into an orderly wait and a clean refusal.
        """
        invoice = self.get_object()

        try:
            with transaction.atomic():
                locked = Invoice.objects.select_for_update().get(pk=invoice.pk)
                apply(locked)
        except InvalidInvoiceTransition as exc:
            raise InvoiceTransitionRefused(str(exc)) from exc

        return Response(self.get_serializer(self.base_queryset().get(pk=invoice.pk)).data)

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        """Stream the rendered invoice to a member of staff.

        Exists so that StaffInvoiceSerializer does not have to hand out the
        storage path. It used to expose the file's own media URL, which is a
        working download only if MEDIA_ROOT is published by the web server —
        and a MEDIA_ROOT that is published is one where invoices/2026/
        INV-2026-00002-PLSM-0002.pdf can be fetched by anyone who can guess a
        tracking number, which every customer of ours can. The customer-facing
        serializer already refused to do this and said why; this is the
        dashboard catching up with it.

        IsStaff is checked by DRF before this runs, so unlike the customer
        route there is no per-object narrowing to do: staff may see every
        invoice, which is the job.
        """
        invoice = self.get_object()
        download = request.query_params.get("download") == "1"
        filename = f"{invoice_number(invoice)}.pdf"

        if not invoice.pdf:
            # No document stored yet (still waiting for review, say). With
            # ?draft=1 the dashboard's Print and Download buttons get the
            # invoice drawn as it stands now, the same drawing approval would
            # store. Nothing is saved: this is a look, not the final document.
            if request.query_params.get("draft") != "1":
                raise Http404("This invoice has no document yet.")
            response = HttpResponse(render_invoice_pdf(invoice), content_type="application/pdf")
            kind = "attachment" if download else "inline"
            response["Content-Disposition"] = f'{kind}; filename="{filename}"'
            response["X-Frame-Options"] = "SAMEORIGIN"
            response["Content-Security-Policy"] = "frame-ancestors 'self'"
            return response

        try:
            handle = invoice.pdf.open("rb")
        except FileNotFoundError as error:
            # A row pointing at bytes that are not there — a media directory
            # restored without its contents. A 404, not the 500 that opening a
            # missing file would otherwise produce.
            raise Http404("This invoice's document is missing.") from error

        # Inline, unlike the customer route, which sends as_attachment so the
        # document lands in a downloads folder under a name that means
        # something. The dashboard opens this in a new tab and staff work
        # through a queue of them; forcing a download for each would be a
        # worse job than the one they had before this route existed.
        #
        # Safe to render in place: every PDF here is either drawn by our own
        # ReportLab code or an upload that InvoiceDocumentSerializer checked
        # for a %PDF- signature, the content type is stated rather than
        # guessed, and SECURE_CONTENT_TYPE_NOSNIFF stops a browser from
        # deciding it is HTML after all.
        #
        # ?download=1 is the exception: the dashboard's Download buttons ask
        # for it, so the file is saved (named after the invoice number)
        # instead of opening in a tab.
        response = FileResponse(
            handle,
            as_attachment=download,
            filename=filename,
            content_type="application/pdf",
        )
        # The invoice page in the dashboard shows this PDF in place, in an
        # iframe. Every other response keeps X_FRAME_OPTIONS = "DENY"; this
        # one may be framed, but only by our own site. Set here, the
        # XFrameOptionsMiddleware leaves it alone.
        response["X-Frame-Options"] = "SAMEORIGIN"
        response["Content-Security-Policy"] = "frame-ancestors 'self'"
        return response

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """PENDING_REVIEW -> APPROVED. Anything else is a 409."""
        return self._transition(lambda invoice: invoice.approve(request.user))

    @action(
        detail=True,
        methods=["post"],
        # This one route takes a file, so it takes a multipart body. The rest
        # of the dashboard is JSON and stays that way.
        parser_classes=[MultiPartParser, FormParser],
    )
    def document(self, request, pk=None):
        """Attach a PDF by hand, and send the invoice with it.

        The normal path is invoicing.tasks.render_approved_invoice, which
        draws the document on a worker when an invoice is approved. This is
        the way in when that has not happened or must not: no worker running,
        a render that failed, or an invoice the office has drawn up itself and
        wants to send as it stands.

        Three states accept an upload, for three different reasons:

          PENDING_REVIEW - the invoice is in the queue and the person
              uploading has decided it is right. Uploading approves it in
              their name and sends it in one step, which is what makes this
              "attach the document and the customer has it" rather than a
              two-button ritual. The approval is not skipped, it is recorded:
              reviewed_by is the uploader, so the audit trail still answers
              who let this document out of the building.

          APPROVED - already reviewed, waiting for a document. Attaching one
              is what sends it: the manual equivalent of the render finishing,
              notification included.

          SENT - the customer already has a document and it is wrong. The
              status does not move and they are not told again; see
              Invoice.replace_document.

        DRAFT and REJECTED are refused with a 409. A rejected invoice has
        something wrong with it that somebody wrote down, and the way back is
        to correct it and resubmit — not to paper over the rejection with a
        file.
        """
        invoice = self.get_object()

        body = InvoiceDocumentSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        upload = body.validated_data["pdf"]

        accepted = (
            Invoice.Status.PENDING_REVIEW,
            Invoice.Status.APPROVED,
            Invoice.Status.SENT,
        )
        if invoice.status not in accepted:
            raise InvoiceTransitionRefused(
                "A document cannot be attached to an invoice that is "
                f"{invoice.get_status_display()}."
            )

        # The name the caller sees, built the same way the render task builds
        # it, so a hand-attached document is indistinguishable from a drawn
        # one in storage. The uploaded file's own name is not used: it comes
        # from the browser and would put whatever it says on our disk.
        filename = f"{invoice_number(invoice)}-{invoice.package.tracking_number}.pdf"

        # Kept so it can be removed once the new one is safely recorded. Doing
        # it the other way round — delete, then write — loses the customer's
        # document if the write fails.
        previous = invoice.pdf.name if invoice.pdf else ""

        # save=False: the column is written by the transition below, together
        # with whatever else moves, so the row never shows a document without
        # the status that belongs with it.
        invoice.pdf.save(filename, upload, save=False)
        stored = invoice.pdf.name

        # Whoever uploads is the one who chose this file, which is not
        # necessarily whoever raised the invoice or whoever approved it — the
        # three are separate columns for exactly this case.
        invoice.record_document(filename=filename, uploaded_by=request.user)

        try:
            # One transaction around the whole move, which is what keeps the
            # render out of the way. approve() schedules the drawing task
            # through transaction.on_commit, so inside an atomic block it
            # cannot start until this has finished — and by then the invoice
            # is SENT, which is precisely the state the task declines to touch.
            # Without this the task would run between the two steps below,
            # draw a second document, and win the race to be the one the
            # customer receives.
            with transaction.atomic():
                if invoice.status == Invoice.Status.PENDING_REVIEW:
                    # Approving in the uploader's name, so the invoice carries
                    # a reviewer like every other one. The decision is not
                    # skipped here, it is attributed: whoever uploads is
                    # saying the invoice is right.
                    invoice.approve(request.user)

                if invoice.status == Invoice.Status.SENT:
                    invoice.replace_document(stored)
                else:
                    # Notifies the customer. This is the invoice arriving.
                    invoice.mark_sent(stored)
        except InvalidInvoiceTransition as exc:
            # Somebody moved the invoice between the check above and here. The
            # file this request wrote is not on any row, so it is removed
            # rather than left behind as an orphan nothing points at.
            invoice.pdf.storage.delete(stored)
            raise InvoiceTransitionRefused(str(exc)) from exc

        # Only now that the new document is recorded. Guarded, because storage
        # hands back the name it actually used — if something was already
        # there it will have suffixed it, and deleting `previous` when the two
        # are the same name would delete what was just written.
        if previous and previous != stored:
            invoice.pdf.storage.delete(previous)

        return Response(self.get_serializer(self.base_queryset().get(pk=invoice.pk)).data)

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        """APPROVED -> SENT, for an invoice that already has its document.

        The other half of "approve it, but do not send yet" on the Add invoice
        form. An invoice raised that way is approved, carries the PDF the
        office attached, and is deliberately not on the customer's profile —
        the render worker leaves it exactly there rather than sending it from
        somewhere nobody can see. This is the button that finishes it.

        Anything else is a 409: an invoice still in review has not been
        approved by anybody, and one already sent does not need sending twice.
        """
        return self._transition(lambda invoice: invoice.send_attached())

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """PENDING_REVIEW -> REJECTED, with a reason. Anything else is a 409."""
        body = InvoiceRejectSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        reason = body.validated_data["rejection_reason"]

        return self._transition(lambda invoice: invoice.reject(request.user, reason))


class CustomerViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Everyone with an account, with their addresses and shipment counts.

    These are the same User and Address rows the customer edits on their own
    profile page - one record seen from two sides, not a back-office copy of
    it. A phone number corrected here is the one the customer reads next time
    they open their profile, and a change they make there is what the next
    load of this table shows. Nothing has to be kept in step, because there is
    only ever one row.

    Create is the one exception to the rule that the back office never makes
    a row on a customer's behalf, and it is a narrow one: this opens an
    account for somebody who is standing in the office, or for a colleague who
    needs to sign in tomorrow morning. It sets no password - see
    StaffCustomerCreateSerializer - so an account made here is unusable until
    its owner has followed the link and chosen one. Delete is admin-only and
    works like a customer deleting their own account - see `destroy`.

    What staff may change is the contact details: name, e-mail, phone, and the
    delivery address through the `address` action below. Those are the fields
    the office finds wrong - an agent at the destination cannot arrange a
    handover against a mistyped number, and the customer has no way of knowing
    it is mistyped.

    Two things stay out. The username is what somebody types to sign in, and
    the role moves through the `role` action, which is where its own refusals
    live. An erased account is refused by both writes below: that row is kept
    to hold shipment records together and is no longer a person.
    """

    serializer_class = StaffCustomerSerializer
    # The office, and a warehouse manager - who reaches this only for the
    # Workers page and sees warehouse workers and nobody else (get_queryset),
    # can open only warehouse worker accounts (create), and can neither move
    # roles, nor delete, nor touch addresses.
    permission_classes = [IsStaffOrWarehouseManager]

    def _is_manager_only(self):
        """A warehouse manager, as opposed to the office: the narrow view."""
        return not self.request.user.is_staff

    def get_serializer_class(self):
        """A different shape going in from the one coming out.

        What a new account needs is four details and a role; what the table
        wants back is a row with package counts, totals and addresses on it.
        Forcing one serializer to be both would mean a create form carrying
        fields nobody fills in.
        """
        if self.action == "create":
            return StaffCustomerCreateSerializer
        return StaffCustomerSerializer

    def create(self, request, *args, **kwargs):
        """Open the account, then answer with the row the table shows.

        The create serializer's own output would be the four fields that went
        in, which is not a row this table can render. Re-serialising through
        the list queryset is what lets the page insert the new customer
        without refetching the whole page.
        """
        writer = self.get_serializer(data=request.data)
        writer.is_valid(raise_exception=True)

        # Opening a customer account is office work; opening one that carries
        # a staff role is handing out access, which only an admin may do.
        role = writer.validated_data.get("role")
        if self._is_manager_only():
            if role != User.Role.WAREHOUSE:
                raise PermissionDenied("A warehouse manager can only open warehouse worker accounts.")
        elif role != User.Role.CUSTOMER and not request.user.is_admin:
            raise PermissionDenied("Only an admin can create accounts with a staff role.")

        # Opening an account that can itself manage people or the office
        # (admin, office, warehouse manager) is handing out power: the admin
        # types their password again first (accounts/reauth.py). The app
        # shows the "Confirm it's you" box by itself and retries.
        if role in POWER_ROLES:
            require_recent_reauth(request)

        initial_pin = None
        with transaction.atomic():
            self.perform_create(writer)
            new_user = writer.instance
            if role in WAREHOUSE_ROLES:
                # In the warehouse's own audit trail: who opened it, as what.
                FloorEvent.objects.create(
                    kind=FloorEvent.Kind.ACCOUNT_CREATED,
                    user=new_user,
                    actor=request.user,
                    details={"role": role},
                )
            if role == User.Role.WAREHOUSE:
                # A warehouse worker gets their first PIN straight away:
                # random (secrets), stored only as an Argon2id hash, shown
                # ONCE in this answer for the manager to hand over in person.
                # The worker must choose their own at the first sign-in.
                initial_pin = floor_pins.issue_pin(new_user, request.user)
            else:
                logger.info(
                    "User %s created account %s with role %s.", request.user.pk, new_user.pk, role
                )

        row = self.get_queryset().get(pk=new_user.pk)
        data = StaffCustomerSerializer(row, context=self.get_serializer_context()).data
        if initial_pin is not None:
            data = {**data, "initial_pin": initial_pin}
        response = Response(data, status=http_status.HTTP_201_CREATED)
        if initial_pin is not None:
            # The PIN is in this one answer and nowhere else: never cached.
            response["Cache-Control"] = "no-store"
        return response

    def perform_create(self, serializer):
        """Create the account, and invite its owner into it once it is real.

        on_commit, so the e-mail cannot go out for an account that a later
        failure in this request rolls back - somebody clicking a link to an
        account that does not exist is a worse morning than a slightly later
        e-mail.

        The invitation itself is fail_silently on the other side: the account
        has been created either way, and a mail server having a bad afternoon
        must not report a created account as a 500.
        """
        user = serializer.save()

        transaction.on_commit(lambda: send_account_invite(user))

    @staticmethod
    def _package_total(statuses):
        """What one customer's packages in `statuses` come to, as a subquery.

        A subquery rather than another .annotate(Sum(...)) over the packages
        join, which is the obvious way to write this and is wrong here. The
        search below joins the address table, and a customer with two
        addresses comes back as two rows — so a joined Sum would add their
        packages up twice and quietly double what they owe. Count survives
        that because it is already distinct=True; Sum has no such escape,
        because summing distinct *values* would drop a second package that
        happened to cost the same as the first.

        A subquery does its own aggregate against the packages table alone, so
        it cannot be multiplied by anything the outer query joins to. Coalesce
        turns "this customer has no such packages" from NULL into 0, so the
        API sends a figure rather than a hole the browser has to interpret.
        """
        money = DecimalField(max_digits=12, decimal_places=2)

        return Coalesce(
            Subquery(
                Package.objects.filter(user=OuterRef("pk"), status__in=statuses)
                .values("user")
                .annotate(total=Sum("value_eur"))
                .values("total")[:1],
                output_field=money,
            ),
            0,
            output_field=money,
        )

    def get_queryset(self):
        people = User.objects.all()
        if self._is_manager_only():
            # The floor's own people and nobody else: not customers, not the
            # office, not other managers. Everything below - update, the row
            # the table gets back - goes through this, so an id from outside
            # it is a 404.
            people = people.filter(role=User.Role.WAREHOUSE, is_superuser=False)
        return (
            people
            # prefetch, or rendering 25 customers costs 25 extra queries for
            # their addresses; annotate, or another 25 for the counts.
            .prefetch_related("addresses")
            # The Workers page shows each warehouse worker's PIN status.
            .select_related("warehouse_pin", "two_factor_device")
            .annotate(
                package_count=Count("packages", distinct=True),
                # What they have settled, and what they are still holding a
                # quote for. Two subqueries rather than two more joins — see
                # _package_total.
                paid_eur=self._package_total(Package.PAID_STATUSES),
                outstanding_eur=self._package_total(
                    Package.AWAITING_PAYMENT_STATUSES
                ),
            )
            .order_by("-date_joined")
        )

    search_fields = (
        "username",
        "first_name",
        "last_name",
        "email",
        "phone_number",
        "addresses__city",
        "addresses__street",
    )
    filter_fields = ()
    ordering_fields = ("date_joined", "username", "email", "last_name")

    def filter_queryset(self, queryset):
        params = self.request.query_params

        search = params.get("search", "").strip()
        if search:
            matches = Q()
            for field in self.search_fields:
                matches |= Q(**{f"{field}__icontains": search})
            # A customer number as written on a parcel: "PLSM-C00012" (or
            # "plsm-c12") finds customer number 12.
            code = re.fullmatch(r"PLSM-C0*(\d+)", search, re.IGNORECASE)
            if code:
                matches |= Q(customer_number=int(code.group(1)))
            # Searching the address fields joins the address table, which
            # repeats a customer once per address they own.
            queryset = queryset.filter(matches).distinct()

        # Erased accounts are kept only to hold shipment records together.
        # They are in the list by default, marked, because a package still
        # points at one — but they can be filtered out.
        erased = params.get("erased")
        if erased == "false":
            queryset = queryset.filter(anonymised_at__isnull=True)
        elif erased == "true":
            queryset = queryset.filter(anonymised_at__isnull=False)

        if params.get("staff") == "true":
            queryset = queryset.filter(is_staff=True)

        # Which roles to show. One name, several separated by commas, or the
        # word "worker" for everyone who works here - which is the filter the
        # Workers page is built on, and the one that cannot be written as
        # is_staff: a driver carries neither flag, and a warehouse worker
        # carries the other one.
        #
        # An unknown name is dropped rather than refused, so a stale bookmark
        # narrows the list instead of failing; a value naming no known role at
        # all is ignored entirely, which is the same as asking for everyone.
        role = params.get("role", "").strip()
        if role:
            wanted = set()
            for name in role.split(","):
                name = name.strip()
                if name == "worker":
                    wanted |= set(WORKER_ROLES)
                elif name in User.Role.values:
                    wanted.add(name)
            if wanted:
                queryset = queryset.filter(role__in=sorted(wanted))

        ordering = params.get("ordering", "").strip()
        if ordering.lstrip("-") in self.ordering_fields:
            queryset = queryset.order_by(ordering)

        return queryset

    def _refuse_if_erased(self, customer):
        """An erased row holds no personal data and nobody to correct it for.

        Writing to one would put a name back on an account that was erased on
        request, which is the one outcome the erasure was for.
        """
        if customer.anonymised_at is not None:
            raise ValidationError("This account has been erased.")

    def _refuse_if_beyond_caller(self, target):
        """Only an admin may edit an account that is more than a customer.

        The e-mail address is where a password-reset link goes, so whoever
        can rewrite it can take the account over. Without this an office
        worker could point an admin's address at their own inbox, ask for a
        reset, and sign in as the admin - the very power the /role/ action
        withholds from them. A superuser is beyond this screen altogether
        unless the caller is one too.
        """
        caller = self.request.user
        if target.is_superuser and not caller.is_superuser:
            raise PermissionDenied("This account can only be changed in Django's admin.")
        if caller.is_warehouse_manager and target.role == User.Role.WAREHOUSE:
            # A manager's own people. get_queryset has already kept everybody
            # else out of their reach.
            return
        if target.role != User.Role.CUSTOMER and target != caller and not caller.is_admin:
            raise PermissionDenied("Only an admin can change the details of a staff account.")

    def _row(self, customer):
        """The customer back through the list queryset.

        Straight from `serializer.instance` the row would be missing the
        `package_count` annotation and would re-query the addresses, so the
        table would get a shape unlike every other row it is holding.
        """
        return Response(self.get_serializer(self.get_queryset().get(pk=customer.pk)).data)

    def update(self, request, *args, **kwargs):
        """Correct a customer's name, e-mail or phone number.

        The serializer decides what is writable; this only refuses the erased
        case and answers with the whole row so the table can swap it in.
        """
        target = self.get_object()
        self._refuse_if_erased(target)
        self._refuse_if_beyond_caller(target)
        # A staff account's e-mail is where its password-reset link goes, so
        # editing one is close to taking it over: confirm it is the admin.
        # (Correcting a customer's details is everyday office work: not asked.)
        if target.role != User.Role.CUSTOMER and target != request.user:
            require_recent_reauth(request)

        serializer = self.get_serializer(
            target, data=request.data, partial=kwargs.pop("partial", False)
        )
        serializer.is_valid(raise_exception=True)
        old_email = target.email
        serializer.save()

        # A new address is where the next password-reset link goes, so this
        # is effectively handing the account over. Leave a trace of who did it
        # and tell the old address, so it cannot happen quietly.
        if (target.email or "").lower() != (old_email or "").lower():
            logger.warning(
                "Staff user %s changed the e-mail address of user %s.",
                request.user.pk,
                target.pk,
            )
            send_email_changed_notice(target, old_email)

        return self._row(target)

    def destroy(self, request, *args, **kwargs):
        """Delete an account from the back office. Admins only.

        The same two outcomes as a customer deleting their own account
        (accounts.views.AccountDeleteView), for the same reasons:

        * No shipments - the row is deleted outright.
        * Has shipments, or is named in an audit record (an invoice it
          approved, a package it measured) - User.anonymise() strips the
          personal data and keeps the row, so those records still hold.

        Either way the person can never sign in again. The answer says which
        one happened, so the table can drop the row or mark it erased.

        Refused for the same accounts the role select refuses: your own, a
        superuser, and one that is already erased.
        """
        target = self.get_object()

        if not request.user.is_admin:
            raise PermissionDenied("Only an admin can delete accounts.")
        if target.pk == request.user.pk:
            raise PermissionDenied("You cannot delete your own account from here.")
        if target.is_superuser:
            raise PermissionDenied("Superuser accounts are managed in the Django admin.")
        if target.anonymised_at is not None:
            raise ValidationError("This account has already been erased.")
        # Deleting an account cannot be undone: confirm it is really the admin.
        require_recent_reauth(request)

        anonymised = target.packages.exists()
        if anonymised:
            target.anonymise()
        else:
            try:
                # atomic, so a delete that PROTECT refuses partway through is
                # rolled back cleanly before the fallback runs.
                with transaction.atomic():
                    target.delete()
            except ProtectedError:
                target.anonymise()
                anonymised = True

        return Response({"anonymised": anonymised}, status=http_status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def address(self, request, pk=None):
        """Save one of this customer's delivery addresses.

        POST the fields with an `id` to correct an existing address, without
        one to add it. The customer's own profile page works the same way and
        writes to the same table, so the address a staff member fixes here is
        the one that pre-fills that customer's next order.

        The id is looked up within this customer's own addresses, so an id
        belonging to somebody else is a 404 rather than somebody else's
        address being rewritten from a URL that says otherwise. The owner is
        set from the URL for the same reason and is never read from the body.
        """
        if self._is_manager_only():
            raise PermissionDenied("Delivery addresses are changed by the office.")
        target = self.get_object()
        self._refuse_if_erased(target)
        self._refuse_if_beyond_caller(target)

        address_id = request.data.get("id")
        existing = (
            get_object_or_404(target.addresses, pk=address_id)
            if address_id not in (None, "")
            else None
        )

        # Partial only when correcting: a new address has to arrive complete,
        # an existing one may be edited a field at a time.
        serializer = StaffAddressWriteSerializer(
            existing, data=request.data, partial=existing is not None
        )
        serializer.is_valid(raise_exception=True)
        # Address.save() keeps exactly one default per customer, so setting
        # is_default here is what clears the previous one.
        serializer.save(user=target)

        return self._row(target)

    @action(detail=True, methods=["post"])
    def role(self, request, pk=None):
        """Move an account between customer, warehouse and admin.

        POST {"role": "admin"}, {"role": "office"}, {"role": "warehouse"},
        {"role": "driver"} or {"role": "customer"}. The two flags are written
        from the role and always together, so that a role never drifts into
        meaning something the word does not: `is_staff` is the office and the
        same flag that opens Django's own /admin/, `is_warehouse` is the floor
        and opens the scanner. An office worker carries both - the desk and
        the floor are one job here - and only a warehouse worker carries the
        second without the first.

        Three accounts this refuses to touch, and the reasons are different:

        - your own, because demoting yourself would take the dashboard away
          mid-click, and promoting yourself is already true;
        - a superuser, because that account holds more than this screen
          manages and clearing is_staff would half-lock it out of /admin/
          while leaving every other permission in place;
        - an erased one, which is a row kept to hold shipment records
          together and no longer a person who can sign in at all.

        StaffCustomerSerializer.can_change_role answers the same three
        questions for the table, so the control is greyed out rather than
        pressed and refused - but this is the check that holds.
        """
        target = self.get_object()

        if not request.user.is_admin:
            raise PermissionDenied("Only an admin can change roles.")
        if target.pk == request.user.pk:
            raise PermissionDenied("You cannot change your own role.")
        if target.is_superuser:
            raise PermissionDenied(
                "Superuser accounts are managed in the Django admin."
            )
        if target.anonymised_at is not None:
            raise ValidationError("This account has been erased.")
        # Handing out (or taking away) power: confirm it is really the admin.
        require_recent_reauth(request)

        body = StaffRoleSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        # The role is written and User.save() sets both flags from it, always
        # together - setting one and leaving the other is how an account ends
        # up being both, or neither. A repeated press changes nothing.
        role = body.validated_data["role"]
        old_role = target.role
        if old_role != role:
            with transaction.atomic():
                target.role = role
                target.save(update_fields=["role", "is_staff", "is_warehouse", "updated_at"])
                if old_role == User.Role.WAREHOUSE:
                    # A floor PIN belongs to the warehouse worker role only;
                    # one left behind would be a way in for nobody's benefit.
                    WarehousePin.objects.filter(user=target).delete()
                if old_role in WAREHOUSE_ROLES or role in WAREHOUSE_ROLES:
                    FloorEvent.objects.create(
                        kind=FloorEvent.Kind.ROLE_CHANGED,
                        user=target,
                        actor=request.user,
                        details={"from_role": old_role, "to_role": role},
                    )
            logger.warning(
                "Admin %s changed the role of user %s from %s to %s.",
                request.user.pk,
                target.pk,
                old_role,
                role,
            )
            # New powers (or fewer) start with a fresh sign-in: every session
            # the account had is ended, so nothing carries over from before.
            twofactor.sign_out_everywhere(target)

        # Back through the list queryset, so the row the table swaps in carries
        # the same package_count and addresses the rest of them do.
        fresh = self.get_queryset().get(pk=target.pk)
        return Response(self.get_serializer(fresh).data)


    @action(detail=True, methods=["post"])
    def active(self, request, pk=None):
        """Switch an account off or on again: POST {"active": false} / true.

        Off takes effect immediately: every session the account has is ended
        here, and a signed-out account cannot sign in again - by password,
        code or PIN (they all refuse an inactive account). Nothing is deleted,
        so their shipments, scans and history stay as they were, and switching
        back on restores the account as it was.

        Who may: an admin, for anybody but themselves and superusers; a
        warehouse manager, for warehouse workers only - get_queryset already
        hides everyone else from them, so another id is a 404. Office staff
        who are not admins may not: switching colleagues off is not theirs.
        """
        target = self.get_object()
        user = request.user

        if not (user.is_admin or user.is_warehouse_manager):
            raise PermissionDenied("Only an admin or a warehouse manager can do this.")
        if target.pk == user.pk:
            raise PermissionDenied("You cannot switch your own account off.")
        if target.is_superuser:
            raise PermissionDenied("Superuser accounts are managed in the Django admin.")
        if target.anonymised_at is not None:
            raise ValidationError("This account has been erased.")

        raw = request.data.get("active")
        if not isinstance(raw, bool):
            raise ValidationError({"active": ["Send true or false."]})

        if target.is_active != raw:
            with transaction.atomic():
                target.is_active = raw
                target.save(update_fields=["is_active", "updated_at"])
                if target.is_warehouse:
                    FloorEvent.objects.create(
                        kind=(
                            FloorEvent.Kind.ACCOUNT_ACTIVATED
                            if raw
                            else FloorEvent.Kind.ACCOUNT_DEACTIVATED
                        ),
                        user=target,
                        actor=user,
                    )
            if not raw:
                # Out now, not at their next click: a device they left signed
                # in on is closed too.
                twofactor.sign_out_everywhere(target)

        fresh = self.get_queryset().get(pk=target.pk)
        return Response(self.get_serializer(fresh).data)

    @action(detail=True, methods=["post"], url_path="sign-out-everywhere")
    def sign_out_everywhere(self, request, pk=None):
        """End every session this account has, on every device. POST, no body.

        For a phone or computer that was lost, or left signed in somewhere.
        The account stays switched on: its owner simply signs in again.

        Who may: an admin, for anybody but themselves and superusers; a
        warehouse manager, for warehouse workers only (get_queryset hides
        everybody else from them, so another id is a 404). Not office staff.
        """
        target = self.get_object()
        user = request.user

        if not (user.is_admin or user.is_warehouse_manager):
            raise PermissionDenied("Only an admin or a warehouse manager can do this.")
        if target.pk == user.pk:
            raise PermissionDenied("Use Sign out on your own account instead.")
        if target.is_superuser and not user.is_superuser:
            raise PermissionDenied("Superuser accounts are managed in the Django admin.")

        twofactor.sign_out_everywhere(target)
        if target.is_warehouse or target.role in WAREHOUSE_ROLES:
            FloorEvent.objects.create(kind=FloorEvent.Kind.SESSIONS_REVOKED, user=target, actor=user)
        else:
            logger.warning("User %s signed user %s out everywhere.", user.pk, target.pk)
        return self._row(target)

    @action(detail=True, methods=["post"], url_path="reset-two-factor")
    def reset_two_factor(self, request, pk=None):
        """Remove a colleague's authenticator app - a lost or new phone. ADMINS ONLY.

        They are signed out everywhere, and their next sign-in sets the app up
        again (when two-factor applies to them). Never your own account: with
        your phone gone, use a recovery code, ask another admin, or run
        `python manage.py reset_two_factor <email>` on the server.
        """
        target = self.get_object()
        if not request.user.is_admin:
            raise PermissionDenied("Only an admin can reset two-factor sign-in.")
        if target.pk == request.user.pk:
            raise PermissionDenied("You cannot reset your own two-factor sign-in from here.")
        if target.is_superuser and not request.user.is_superuser:
            raise PermissionDenied("Superuser accounts are managed in the Django admin.")
        # Taking somebody's second factor away: confirm it is really the admin.
        require_recent_reauth(request)

        twofactor.remove(target, TwoFactorAuditEvent.Kind.RESET_BY_ADMIN, actor=request.user, request=request)
        return self._row(target)


class SignInCodeNotSent(APIException):
    """The code could not be e-mailed, so nothing was done.

    503: the request was fine and the admin is allowed to make it; the mail
    server is what failed, and trying again in a moment is the right advice.
    """

    status_code = http_status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "The code could not be e-mailed. Try again in a moment."


class WarehouseSignInCodeView(APIView):
    """POST {"email": ...}: e-mail a warehouse worker a four-digit sign-in code.

    Admins and warehouse managers, the two who decide who gets onto the floor
    (and only a warehouse worker can be sent one - see issue_code). The
    worker signs in with the code and their address on the login page - see
    accounts.views.WarehouseCodeLoginView.

    The answer says where the code went and how long it lasts, and never what
    it is. If it did, an admin could sign in as any worker simply by asking for
    a code, and the record of who did what on the floor would be a record of
    whoever had admin rights that day.

    Unlike the login endpoint this does say why it refused. The caller is an
    admin who can already list every account, so there is nothing to protect,
    and "that account is an office worker" is the sentence that saves them
    typing the same address three times.
    """

    permission_classes = [IsWarehouseManager]
    throttle_scope = "warehouse_code_send"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        body = StaffSignInCodeSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        target = User.objects.filter(email__iexact=body.validated_data["email"]).first()
        if target is None:
            raise ValidationError({"email": "No account has that e-mail address."})

        on_screen = code_goes_on_screen()
        try:
            row, code = issue_code(target, issued_by=request.user, shown_on_screen=on_screen)
        except CodeNotAllowed as refusal:
            raise ValidationError({"email": str(refusal)}) from refusal

        # No real mail on this site (yet): the admin is shown the code to pass
        # on in person, and nothing is e-mailed. See code_goes_on_screen for
        # what that costs, and how it switches back by itself.
        if on_screen:
            return Response(
                {
                    "sent_to": target.email,
                    "expires_in_minutes": settings.WAREHOUSE_CODE_MINUTES,
                    "delivery": "screen",
                    "code": code,
                }
            )

        try:
            send_sign_in_code(target, code)
        except Exception as error:
            # Not left behind: a live code nobody received is a code nobody
            # can use and nobody knows about, which is only ever a risk. The
            # admin is told, and the retry makes a fresh one.
            #
            # Any failure, not only a mail server being down (OSError). The
            # code is a local variable in this frame, and an error reporter
            # that records locals - Sentry does by default - would send the
            # plain code off the box. An unexpected error (a bad header, a
            # template bug) that left this view with the code still live
            # would put a usable credential in somebody's error tracker.
            # Deleting it first means whatever gets reported is already dead.
            row.delete()
            logger.exception("Could not e-mail a sign-in code to user %s.", target.pk)
            raise SignInCodeNotSent() from error

        return Response(
            {
                "sent_to": target.email,
                "expires_in_minutes": settings.WAREHOUSE_CODE_MINUTES,
                "delivery": "email",
            }
        )


class RequestOriginView(APIView):
    """GET: the address headers this request arrived with. Admins only.

    For setting DJANGO_NUM_PROXIES, which every per-address throttle depends
    on, from what the proxies in front of this deployment actually do rather
    than from what anybody believes they do. Open it once through the site
    (the /api route) and once with a forged header, each time
    with an X-Forwarded-For of your own invented address added:

        curl -H "X-Forwarded-For: 203.0.113.9" ...

    If 203.0.113.9 shows up in `throttle_ident`, the throttles can still be
    dodged and the setting is wrong. The right value is the one where
    `throttle_ident` is your own public address on both routes.

    Only the caller's own request is described, and only to an admin.
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        meta = request.META
        return Response(
            {
                "remote_addr": meta.get("REMOTE_ADDR"),
                "x_forwarded_for": meta.get("HTTP_X_FORWARDED_FOR"),
                "x_real_ip": meta.get("HTTP_X_REAL_IP"),
                "do_connecting_ip": meta.get("HTTP_DO_CONNECTING_IP"),
                "num_proxies": api_settings.NUM_PROXIES,
                "throttle_ident": BaseThrottle().get_ident(request),
            }
        )


class DailySummaryView(APIView):
    """GET: the office's daily summary for the Overview page (staff/daily_summary.py).

    Yesterday's activity and what is waiting now, as numbers. With
    ?highlights=1 the AI's "Start with" lines come too - asked for
    separately, so the numbers show at once. Those lines are kept for
    HIGHLIGHTS_SECONDS, so every colleague opening the dashboard does not
    pay for a new OpenAI call; "waiting now" is always counted fresh.
    """

    permission_classes = [IsStaff]
    HIGHLIGHTS_SECONDS = 60 * 60

    def get(self, request):
        from django.core.cache import cache

        from . import daily_summary

        day = timezone.localdate() - timedelta(days=1)
        data = daily_summary.build(day)

        if request.query_params.get("highlights") == "1":
            key = f"daily-summary-highlights:{data['date']}"
            highlights = cache.get(key)
            if highlights is None:
                highlights = daily_summary.write_highlights(data)
                # An empty answer (AI off or failed) is not kept, so it is
                # tried again next time rather than missing for an hour.
                if highlights:
                    cache.set(key, highlights, self.HIGHLIGHTS_SECONDS)
            data["highlights"] = highlights
        return Response(data)


class OverviewView(APIView):
    """The dashboard landing page: what needs attention, and recent activity.

    One request rather than four, so the page paints in a single round trip.
    """

    permission_classes = [IsStaff]

    def get(self, request):
        try:
            days = int(request.query_params.get("days", RECENT_DAYS))
        except ValueError:
            days = RECENT_DAYS
        if days not in ALLOWED_RANGES:
            days = RECENT_DAYS

        # From the start of the first day, so the chart's first column covers
        # a whole day like every other one rather than a partial one.
        since = (timezone.now() - timedelta(days=days - 1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        quotes = QuoteRequest.objects.all()
        messages = ContactMessage.objects.all()
        packages = Package.objects.all()
        bookings = Booking.objects.all()
        invoices = Invoice.objects.all()
        documents = PackageDocument.objects.all()
        # Anonymised rows are deleted customers kept only to hold their
        # shipment records together; counting them as customers would
        # overstate the business.
        customers = User.objects.filter(is_active=True, anonymised_at__isnull=True)

        quote_status = counts_by(quotes, "status")
        package_status = counts_by(packages, "status")

        context = {"request": request}
        # Each model already orders newest first, so a plain slice is the
        # most recent few.
        recent_quotes = quotes[:RECENT_LIMIT]
        recent_messages = messages.prefetch_related("replies__author")[:RECENT_LIMIT]
        # The same related rows the Packages list loads up front: the full
        # StaffPackageSerializer reads every one of them on every row, and
        # without this each recent package cost five more queries.
        recent_packages = packages.select_related(
            "user", "invoice", "delivery_address"
        ).prefetch_related(
            "documents__uploaded_by", "documents__customer", "warehouse_measurements__worker"
        )[:RECENT_LIMIT]

        return Response(
            {
                "period_days": days,
                "ranges": list(ALLOWED_RANGES),
                # One row per day for the chart.
                "daily": daily_series(
                    since,
                    days,
                    quotes=quotes,
                    packages=packages,
                    messages=messages,
                ),
                "quotes": {
                    "total": sum(quote_status.values()),
                    "new": quote_status.get(QuoteRequest.Status.NEW, 0),
                    "recent": quotes.filter(created_at__gte=since).count(),
                    "trend": trend(quotes, "created_at", since, days),
                    "by_status": quote_status,
                },
                "messages": {
                    "total": messages.count(),
                    "unhandled": messages.filter(handled=False).count(),
                    "recent": messages.filter(created_at__gte=since).count(),
                    "trend": trend(messages, "created_at", since, days),
                },
                "packages": {
                    "total": sum(package_status.values()),
                    "in_transit": package_status.get(Package.Status.IN_TRANSIT, 0),
                    "awaiting_action": (
                        package_status.get(Package.Status.QUOTED, 0)
                        + package_status.get(Package.Status.PAID, 0)
                    ),
                    "recent": packages.filter(created_at__gte=since).count(),
                    "trend": trend(packages, "created_at", since, days),
                    # What share of everything ever shipped has arrived. The
                    # donut on the overview reads this rather than working it
                    # out from by_status, so the page and the API agree on
                    # what "delivered" counts.
                    "delivered": package_status.get(Package.Status.DELIVERED, 0),
                    "by_status": package_status,
                },
                "bookings": {
                    "total": bookings.count(),
                    "new": bookings.filter(status=Booking.Status.NEW).count(),
                    "recent": bookings.filter(created_at__gte=since).count(),
                },
                # pending_review is what the sidebar's pill counts: the only
                # number here that is a queue somebody has to work through.
                # An approved invoice with no document yet is a render that
                # failed or never ran, which is worth seeing separately —
                # nothing is waiting on a person, but something is stuck.
                "invoices": {
                    "total": invoices.count(),
                    "pending_review": invoices.filter(
                        status=Invoice.Status.PENDING_REVIEW
                    ).count(),
                    "rejected": invoices.filter(
                        status=Invoice.Status.REJECTED
                    ).count(),
                    "awaiting_document": invoices.filter(
                        status=Invoice.Status.APPROVED, pdf=""
                    ).count(),
                    "recent": invoices.filter(created_at__gte=since).count(),
                    "trend": trend(invoices, "created_at", since, days),
                    # Raised and finished with: the customer has the document.
                    "sent": invoices.filter(status=Invoice.Status.SENT).count(),
                },
                # What customers have sent in. `unattached` is the pill:
                # a receipt filed against no shipment is one nobody has
                # placed yet, and it is the only number here that is work.
                "documents": {
                    "total": documents.count(),
                    "unattached": documents.filter(package__isnull=True).count(),
                    "recent": documents.filter(created_at__gte=since).count(),
                },
                # AI document reading: jobs a person has to look at.
                "document_review": {
                    "needs_review": DocumentJob.objects.filter(
                        status__in=(DocumentJob.Status.NEEDS_REVIEW, DocumentJob.Status.FAILED)
                    ).count(),
                },
                "customers": {
                    "total": customers.count(),
                    "recent": customers.filter(date_joined__gte=since).count(),
                    "trend": trend(customers, "date_joined", since, days),
                },
                "recent_quotes": StaffQuoteRequestSerializer(
                    recent_quotes, many=True, context=context
                ).data,
                "recent_messages": StaffContactMessageSerializer(
                    recent_messages, many=True, context=context
                ).data,
                "recent_packages": StaffPackageSerializer(
                    recent_packages, many=True, context=context
                ).data,
            }
        )
