"""The intake sheet API, mounted at /api/staff/intake/ by staff/urls.py.

Kept in this app rather than in staff/views.py, which is where every other
back-office view lives. The reason is that the intake sheet brings a model, a
state change, a recipient rule, a worker and its own wording with it - a
subsystem, not another table on the dashboard - and staff/views.py is already
long enough that a reader looking for the shipment rules has to scroll past
things that have nothing to do with them.

It subclasses the staff dashboard's own base view, so the search, the
filtering and the ordering are the same ones every other staff list uses. The
one thing it deliberately changes is the permission: these routes are the only
ones a warehouse account can reach, and IsWarehouseOrStaff below is what lets
it. Both classes still live in staff/permissions.py, so who may call what is
answered in one file rather than invented here.
"""

import logging
from datetime import date, timedelta

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins
from rest_framework import status as http_status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from staff.permissions import IsWarehouseOrStaff, WarehouseRateThrottle
from staff.views import StaffViewSet
from tracking.matching import confirm_arrival, find_by_courier_number, scan_summary

from . import customers, intake_numbers, operations, review, scanning, shipments
from .access import SectionAllowed
from .models import AlreadyReleased, IntakeSheet, IntakeSheetPhoto, NotReleased
from .recipients import handover_recipients
from .records import stream_photo
from .serializers import (
    IntakeSheetPhotoSerializer,
    IntakeSheetSerializer,
    ScannedBookingSerializer,
    ScannedPackageSerializer,
    can_assign_freight,
    missing_for_release,
)
from .services import release_sheet

logger = logging.getLogger(__name__)


class SheetLocked(APIException):
    """An edit to a sheet that has already been handed over.

    409 rather than 400: the request was well formed and the caller was
    allowed to make it. The sheet has simply been sent, and a record of what
    was handed over is not a form - the same rule, and the same status code,
    as a shipment that has already left.
    """

    status_code = http_status.HTTP_409_CONFLICT
    default_detail = (
        "This intake sheet has been released and can no longer be changed."
    )


class NotYourDraft(PermissionDenied):
    """A warehouse worker changing a sheet somebody else started.

    Workers correct their own drafts; anybody else's is for its author, or for
    an admin or warehouse manager. See intake_numbers.may_edit.
    """

    default_detail = "Only the worker who started this intake, or a manager, can change it."


class SheetArchived(APIException):
    """A change to a sheet a manager archived (409). Unarchive it first."""

    status_code = http_status.HTTP_409_CONFLICT
    default_detail = "This intake is archived. A manager has to bring it back first."


class FreightRefused(PermissionDenied):
    """A warehouse account trying to choose sea or air.

    The office decides how goods travel. The warehouse page shows the choice
    read-only and never sends it; this is what holds when a request is made
    by hand.
    """

    default_detail = "Only the office can assign sea or air freight."


class CustomerLookupView(APIView):
    """GET ?q=...: which existing customers these goods could belong to.

    By customer number, e-mail address, shipment / booking / consignment /
    courier number, or name. Answers what a worker needs to recognise the
    customer and choose a shipment to link to - no phone number, no full
    address, no money. Never writes, never links: see assign-customer.
    """

    permission_classes = [IsWarehouseOrStaff]
    throttle_classes = [WarehouseRateThrottle]

    def get(self, request):
        return Response(customers.lookup(request.query_params.get("q", "")))


class IntakeSheetViewSet(mixins.CreateModelMixin, StaffViewSet):
    """Warehouse intake sheets: list, read, fill in, and hand over.

    Create is added to the staff base, which otherwise forbids it. That rule
    exists because nothing in the back office should be able to manufacture a
    customer's submission, and this is not one: an intake sheet is written by
    staff, about goods they are looking at, and there is nowhere else it could
    come from.

    Delete only for an EMPTY sheet, and only by an admin or a warehouse
    manager (warehouse/intake_numbers.py): a sheet with anything on it is the
    record that a delivery was received - it can be archived, never deleted.
    """

    # The one route under /api/staff/ that is not office-only. A warehouse
    # account has is_warehouse without is_staff, so every other viewset in the
    # dashboard - invoices, customers, quotes, shipments - still refuses it,
    # and so does Django's own /admin/.
    permission_classes = [IsWarehouseOrStaff, SectionAllowed]
    throttle_classes = [WarehouseRateThrottle]
    # An admin can switch the intake sheets off for warehouse workers.
    access_section = "intake"

    serializer_class = IntakeSheetSerializer

    queryset = IntakeSheet.objects.select_related(
        "created_by", "released_by", "booking", "package", "customer", "reviewed_by"
    ).prefetch_related("measurements")

    search_fields = (
        "reference",
        "supplier",
        "sender",
        "recipient",
        "destination",
        "employees",
        "employee_name",
        "notes",
    )
    filter_fields = ("status", "freight")
    ordering_fields = (
        "created_at", "updated_at", "received_on", "released_at", "status"
    )

    def get_queryset(self):
        # Each sheet carries `is_empty_sheet` (nothing on it at all - see
        # intake_numbers.empty_sheets), worked out by the database in the same
        # query, so the list can show "Delete" on exactly the sheets a manager
        # may delete without asking the database once per row.
        return intake_numbers.with_empty_flag(super().get_queryset())

    def get_throttles(self):
        throttles = super().get_throttles()
        if self.action == "read_label":
            # Each one is a paid OpenAI call: a ceiling on top of the
            # warehouse's all-day budget (settings 'label_read').
            self.throttle_scope = "label_read"
            throttles.append(ScopedRateThrottle())
        return throttles

    @action(detail=True, methods=["post"], url_path="review-decision")
    def review_decision(self, request, pk=None):
        """POST {"decision": "approve" | "correction", "note": "..."}.

        A warehouse manager's verdict on a released sheet. "correction"
        reopens it (a new version) with the note for the worker, and needs a
        note. Admins and warehouse managers only - the floor gets a 403. Every
        verdict is recorded (IntakeReview). See warehouse/review.py.
        """
        sheet = review.decide(
            self.get_object(),
            request.user,
            str(request.data.get("decision") or ""),
            request.data.get("note", ""),
        )
        fresh = self.get_queryset().get(pk=sheet.pk)
        return Response(self.get_serializer(fresh).data)

    @action(detail=True, methods=["post"], url_path="assign-customer")
    def assign_customer(self, request, pk=None):
        """POST {"customer": id, "package"?: id, "booking"?: id,
        "matched_by"?: "...", "reason"?: "..."}: whose goods these are.

        An EXISTING customer only - nothing here creates an account. The
        shipment or booking, if given, must be one of that customer's open
        ones. Identifying goods without a customer: anybody on the floor.
        Moving goods to a different customer: admins and warehouse managers,
        with a reason. Every assignment is recorded (IntakeAssignment).
        See warehouse/customers.py.
        """
        sheet = self.get_object()
        sheet = customers.assign(
            sheet,
            request.user,
            customer_id=request.data.get("customer"),
            package_id=request.data.get("package"),
            booking_id=request.data.get("booking"),
            matched_by=request.data.get("matched_by", ""),
            reason=request.data.get("reason", ""),
        )
        # Linked to a shipment just now: the measurements on the sheet count
        # for it, and it gets the sheet's freight - as when a sheet is saved.
        self._share_freight(sheet)
        operations.measure_from_intake(sheet, request.user)
        fresh = self.get_queryset().get(pk=sheet.pk)
        return Response(self.get_serializer(fresh).data)

    @action(detail=False, methods=["post"], url_path="read-label")
    def read_label(self, request):
        """POST a photo of a parcel's label (multipart "file"): the sheet's boxes, read by AI.

        Answers {"fields", "tracking_number", "lines", "match"} - see warehouse/label_ai.py.
        Nothing is saved: the page fills in the empty boxes and the worker
        checks them. 503 when the AI is not set up or could not read it; the
        page then reads the label on the device, as before.
        """
        from rest_framework import serializers as drf_serializers

        from bookings.serializers import validate_attachment
        from docreview.ai import ExtractionError

        from .label_ai import read_label

        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "Take or choose a photo of the label."})
        try:
            content_type = validate_attachment(upload)
        except drf_serializers.ValidationError as error:
            raise ValidationError({"file": error.detail}) from None
        upload.seek(0)

        try:
            result = read_label(upload.read(), content_type)
        except ExtractionError:
            logger.exception("Reading a label with AI failed")
            return Response(
                {"detail": "The label could not be read by AI just now."},
                status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(result)

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)

        # `?measured=true` for the office's Measurements page: only sheets
        # with at least one line on them. A boolean, so not a filter_field -
        # Django would read the string "false" as True.
        measured = self.request.query_params.get("measured")
        if measured in {"true", "false"}:
            queryset = queryset.filter(
                measurements__isnull=measured == "false"
            ).distinct()

        # `?mine=true` for the warehouse profile page: the sheets this person
        # started. Only ever the caller's own, so there is no user id to pass.
        if self.request.query_params.get("mine") == "true":
            queryset = queryset.filter(created_by=self.request.user)

        # `?review=needs_correction`: sheets a manager sent back to the floor
        # (oldest verdict first); `?review=awaiting_review`: released, not
        # yet looked at. See warehouse/review.py.
        wanted = self.request.query_params.get("review")
        if wanted == "needs_correction":
            queryset = queryset.filter(
                status=IntakeSheet.Status.DRAFT,
                review_status=IntakeSheet.Review.NEEDS_CORRECTION,
            ).order_by("reviewed_at")
        elif wanted == "awaiting_review":
            queryset = queryset.filter(
                status=IntakeSheet.Status.RELEASED,
                review_status=IntakeSheet.Review.AWAITING,
            ).order_by("released_at")

        # Archived sheets (a manager put them away) leave the lists:
        # `?archived=true` shows only those, `?archived=all` everything.
        # Reading one sheet by its id still works.
        params = self.request.query_params
        if self.action == "list":
            archived = params.get("archived")
            if archived == "true":
                queryset = queryset.filter(archived_at__isnull=False)
            elif archived != "all":
                queryset = queryset.filter(archived_at__isnull=True)

        # `?empty=true`: sheets with nothing on them (intake_numbers.py) -
        # the ones a manager may delete.
        if params.get("empty") == "true":
            queryset = intake_numbers.empty_sheets(queryset)

        # The manager's filters: who started it, whose goods, and when.
        for param, field in (("created_by", "created_by_id"), ("customer", "customer_id")):
            value = params.get(param)
            if value:
                if not value.isdigit():
                    raise ValidationError({param: ["Expected a number."]})
                queryset = queryset.filter(**{field: int(value)})
        for param, lookup in (
            ("created_from", "created_at__date__gte"),
            ("created_to", "created_at__date__lte"),
        ):
            value = params.get(param)
            if value:
                try:
                    day = date.fromisoformat(value)
                except ValueError:
                    raise ValidationError({param: ["Use a date like 2026-11-07."]}) from None
                queryset = queryset.filter(**{lookup: day})
        # `?customer_q=klaas`: whose goods, by name, e-mail or customer
        # number (PLSM-C00012 or just 12).
        customer_q = params.get("customer_q", "").strip()
        if customer_q:
            match = (
                Q(customer__first_name__icontains=customer_q)
                | Q(customer__last_name__icontains=customer_q)
                | Q(customer__email__icontains=customer_q)
            )
            digits = customer_q.upper().removeprefix("PLSM-C").lstrip("0")
            if digits.isdigit():
                match |= Q(customer__customer_number=int(digits))
            queryset = queryset.filter(match)

        # `?number=2` or `?number=002`: one intake number.
        number = params.get("number", "").strip().lstrip("0")
        if number:
            if not number.isdigit():
                raise ValidationError({"number": ["Expected a number."]})
            queryset = queryset.filter(number=int(number))

        # `?unassigned=true`: the "Without a customer" queue - goods nobody
        # has tied to a customer, shipment or booking yet. Oldest first, so
        # what has waited longest is at the top.
        if self.request.query_params.get("unassigned") == "true":
            queryset = queryset.filter(
                customer__isnull=True, package__isnull=True, booking__isnull=True
            ).order_by("created_at")

        return queryset

    def perform_create(self, serializer):
        """Stamp the sheet with whoever is filling it in, and sign it as them.

        `employee_name` is written here and nowhere else. The serializer holds
        it read-only, so a name sent by a caller is discarded rather than
        refused - there is no version of this request in which somebody else's
        name is the right answer, and a 400 would only invite a retry.

        The signature and `created_by` therefore always agree. They are kept
        as two fields because they answer different questions later: one is a
        name that must not change, the other a link that must not be trusted
        to still exist.
        """
        user = self.request.user
        if serializer.validated_data.get("freight") and not can_assign_freight(user):
            raise FreightRefused()
        # The number is given, not typed (see _number), except by whoever
        # runs the warehouse: an admin or a warehouse manager.
        if not user.can_manage_warehouse:
            serializer.validated_data.pop("reference", None)

        sheet = serializer.save(
            created_by=user,
            employee_name=user.get_full_name() or user.get_username(),
        )

        # The intake number (001, 002 ...): see warehouse/intake_numbers.py.
        intake_numbers.allocate(sheet)
        self._prefill_from_link(sheet)
        # Started from a scan of a known shipment or booking: whose goods
        # these are is known already (warehouse/customers.py).
        customers.sync_from_links(sheet)
        self._number(sheet)
        self._share_freight(sheet)
        # The intake form is where the warehouse measures: the package counts
        # as measured from here, no second measuring on the package page.
        operations.measure_from_intake(sheet, user)

    def _number(self, sheet):
        """Give a new sheet its shipment number if nobody typed one.

        The linked booking's shipping number, else the linked shipment's
        tracking number, else the next number of the office's own series
        (PLSM-00001, PLSM-00002 ... - bookings.models.ShippingNumberSequence),
        so every sheet on the floor has a number to write on the goods.
        """
        if sheet.reference.strip():
            return
        from bookings.models import ShippingNumberSequence

        booking, package = sheet.booking, sheet.package
        reference = (booking.shipping_number.strip() if booking else "") or (
            package.tracking_number if package else ""
        )
        with transaction.atomic():
            sheet.reference = reference or ShippingNumberSequence.next_number()
            sheet.save(update_fields=["reference"])

    def _prefill_from_link(self, sheet):
        """Copy across what the office already knows, when there is a link.

        A sheet started from a scan arrives with a booking or a shipment
        attached, and the destination and the names on it were typed by
        somebody weeks ago. Asking a person holding a phone to read them off a
        screen and type them again is how two records of one consignment start
        to disagree.

        Only ever into boxes left empty, and only at creation. This is a head
        start on a blank form, not a rule - what the warehouse sees in front
        of them beats what was booked, every time, and the moment they correct
        a box it stays corrected.
        """
        booking = sheet.booking
        package = sheet.package

        if booking is None and package is None:
            return

        fields = {}

        if booking is not None:
            fields = {
                "destination": booking.destination_label,
                "sender": booking.sender_name,
                "recipient": booking.recipient_name,
                "freight": booking.freight,
            }
        elif package is not None:
            fields = {
                "destination": package.destination_label,
                "recipient": package.user.get_full_name() if package.user else "",
                "freight": package.freight,
            }

        filled = {
            field: value
            for field, value in fields.items()
            if value and not getattr(sheet, field)
        }

        if filled:
            for field, value in filled.items():
                setattr(sheet, field, value)
            sheet.save(update_fields=list(filled))

    def perform_update(self, serializer):
        """Refuse any edit once the sheet has gone out.

        Checked against the stored row rather than the instance the serializer
        is holding, because `status` is read-only in the serializer and so the
        two cannot differ - but the row can have been released by somebody
        else between this request being sent and being handled.
        """
        if serializer.instance.released:
            raise SheetLocked()
        self._check_may_edit(serializer.instance)

        # Sea or air: the office's call. Sending back the value already
        # stored is not a change (an older page does that on every save); a
        # different one from a warehouse account is refused, not ignored, so
        # the caller knows it did not happen.
        previous_freight = serializer.instance.freight
        wanted_freight = serializer.validated_data.get("freight", previous_freight)
        if wanted_freight != previous_freight and not can_assign_freight(self.request.user):
            raise FreightRefused()

        # The shipment number on a sheet is fixed once given, for everybody
        # (admins and warehouse managers included). Sending the same number
        # back, as the form does on every save, is not a change. A sheet with
        # no number yet gets one from _number below, not from the caller.
        wanted = serializer.validated_data.get("reference")
        if wanted is not None and wanted.strip() != serializer.instance.reference.strip():
            raise ValidationError({"reference": ["The shipment number cannot be changed."]})

        # Linking the sheet to another customer's shipment or booking is a
        # change of owner: that goes through "Assign customer" (with its
        # permission check and its record), not through a form save.
        customers.check_link_change(
            serializer.instance,
            serializer.validated_data.get("package"),
            serializer.validated_data.get("booking"),
        )

        # A sheet the office prepared (a booking sent to the warehouse) has no
        # signature yet: the first person to save it is the one filling it in.
        extra = {}
        if serializer.instance.created_by_id is None and not serializer.instance.employee_name:
            user = self.request.user
            extra = {"created_by": user, "employee_name": user.get_full_name() or user.get_username()}

        sheet = serializer.save(**extra)
        customers.sync_from_links(sheet)
        # A sheet from before numbering, or one a manager emptied, gets one.
        self._number(sheet)
        if sheet.freight != previous_freight:
            self._assign_package_freight(sheet)
        else:
            self._share_freight(sheet)
        operations.measure_from_intake(sheet, self.request.user)

    def _check_may_edit(self, sheet):
        """Refuse a change to an archived sheet, or to another worker's draft."""
        if sheet.archived:
            raise SheetArchived()
        if not intake_numbers.may_edit(self.request.user, sheet):
            raise NotYourDraft()

    def destroy(self, request, pk=None):
        """DELETE: remove an EMPTY sheet and free its intake number.

        403 for anybody but an admin or warehouse manager; 409 when the sheet
        holds anything at all (archive it instead). The deletion is recorded
        (IntakeDeletion). See warehouse/intake_numbers.py.
        """
        intake_numbers.delete_empty(self.get_object(), request.user)
        return Response(status=http_status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        """POST {"reason": "..."}: a manager puts a sheet away. Nothing is deleted."""
        sheet = intake_numbers.archive(self.get_object(), request.user, request.data.get("reason"))
        return Response(self.get_serializer(sheet).data)

    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        """POST: a manager brings an archived sheet back."""
        sheet = intake_numbers.unarchive(self.get_object(), request.user)
        return Response(self.get_serializer(sheet).data)

    def _share_freight(self, sheet):
        """Give the linked shipment the sheet's freight, if it has none yet.

        Only into a blank: when the office has already decided how a shipment
        travels, a worker picking the other box on a form does not overrule it.
        """
        package = sheet.package
        if package is not None and sheet.freight and not package.freight:
            package.freight = sheet.freight
            package.save(update_fields=["freight", "updated_at"])

    def _assign_package_freight(self, sheet):
        """The office changed the sheet's freight: the package follows.

        Unlike _share_freight this overwrites, because it is the office
        itself deciding - here rather than on the Packages page.
        """
        package = sheet.package
        if package is not None and package.freight != sheet.freight:
            package.freight = sheet.freight
            package.save(update_fields=["freight", "updated_at"])

    @action(detail=True, methods=["post"])
    def freight(self, request, pk=None):
        """POST {"freight": "sea" | "air" | ""}: the office assigns sea or air.

        Its own action rather than part of the sheet's PATCH, for two reasons.
        It is allowed on a released sheet too - the warehouse hands the goods
        over, and the office decides afterwards how they travel - while every
        other box is locked by then. And it is the one change on a sheet that
        only the office may make: 403 for anybody else, whatever the page
        shows.
        """
        if not can_assign_freight(request.user):
            raise FreightRefused()
        sheet = self.get_object()
        value = request.data.get("freight", "")
        if value is None:
            value = ""
        if value not in ("", *IntakeSheet.Freight.values):
            raise ValidationError({"freight": ["Choose sea, air, or nothing."]})

        if value != sheet.freight:
            with transaction.atomic():
                sheet.freight = value
                sheet.save(update_fields=["freight", "updated_at"])
                self._assign_package_freight(sheet)
        return Response(self.get_serializer(sheet).data)

    @action(detail=True, methods=["post"])
    def release(self, request, pk=None):
        """Hand the sheet to the rest of the staff, and mail it to them.

        Three answers:

        * 400, listing by name every box still unanswered. The React app shows
          the same list beside the button before it is pressed; this is what
          holds when two people have the sheet open and one of them clears a
          field.
        * 409, when somebody has already released it.
        * 200 and the sheet, with `emailed_at` still null - the mail is queued
          on commit and leaves on a worker, so a sheet is released the instant
          this answers whether or not the mail server is having a good day.

        The transaction wraps the state change only. transaction.on_commit
        inside release_sheet is what holds the e-mail back until this block
        has actually committed.
        """
        sheet = self.get_object()
        if not sheet.released:
            self._check_may_edit(sheet)

        missing = missing_for_release(sheet)
        if missing:
            raise ValidationError(
                {
                    "missing": missing,
                    "detail": (
                        "Fill in the rest of the sheet before sending it on: "
                        + ", ".join(missing)
                        + "."
                    ),
                }
            )

        try:
            with transaction.atomic():
                release_sheet(sheet, by=request.user)
        except AlreadyReleased as error:
            raise SheetLocked(str(error)) from error

        return Response(self.get_serializer(sheet).data)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        """Put a released sheet back into draft, so a mistake can be fixed.

        No e-mail goes out here, and that is the point: reopening is not the
        correction, it is picking the sheet back up. What gets sent is the
        next release, which says plainly that it is a correction and which
        version it is.

        409 when the sheet is already a draft - somebody else reopened it
        first, and nothing needs doing.
        """
        sheet = self.get_object()
        # Correcting a sheet that was handed over: admins and warehouse
        # managers only - not the office, not the floor (they ask a manager).
        if not intake_numbers.may_correct(request.user):
            raise PermissionDenied("Only a manager can reopen an intake that was handed over.")
        if sheet.archived:
            raise SheetArchived()

        try:
            sheet.reopen()
        except NotReleased as error:
            raise SheetLocked(str(error)) from error

        return Response(self.get_serializer(sheet).data)

    @action(detail=True, methods=["get", "post"])
    def photos(self, request, pk=None):
        """GET the sheet's photos. POST multipart {photos[]} to add some.

        Mostly photos of the damage, for when "Schade aanwezig?" is Ja. Only
        while the sheet is a draft: a released sheet is locked, photos too.
        """
        sheet = self.get_object()
        if request.method == "POST":
            if sheet.released:
                raise SheetLocked()
            self._check_may_edit(sheet)
            operations.add_intake_photos(sheet, request.user, request.FILES.getlist("photos"))
            status_code = http_status.HTTP_201_CREATED
        else:
            status_code = http_status.HTTP_200_OK
        rows = sheet.photos.select_related("worker")
        return Response(IntakeSheetPhotoSerializer(rows, many=True).data, status=status_code)

    @action(
        detail=True,
        methods=["get", "delete"],
        url_path=r"photos/(?P<photo_id>[0-9]+)",
        url_name="photo",
    )
    def photo(self, request, pk=None, photo_id=None):
        """GET one photo's image; DELETE it (a photo of the wrong box)."""
        sheet = self.get_object()
        photo = get_object_or_404(IntakeSheetPhoto, pk=photo_id, sheet=sheet)
        if request.method == "DELETE":
            if sheet.released:
                raise SheetLocked()
            self._check_may_edit(sheet)
            operations.remove_intake_photo(photo)
            return Response(status=http_status.HTTP_204_NO_CONTENT)
        return stream_photo(photo)

    @action(detail=False, methods=["get"])
    def scan(self, request):
        """What a code read off a box points at. `?code=` and nothing else.

        A GET, and it writes nothing. The whole risk of a scanner is the
        mis-scan - the label on the box behind, a code printed twice on one
        carton - and a lookup that created a row on every read would turn each
        of those into a junk sheet somebody has to find and explain. So this
        answers, and starting the sheet is a second, deliberate tap.

        The answer names what was found in `match`, and carries whichever of
        the three it was. See warehouse/scanning.py for the order they are
        asked in and why.
        """
        found = scanning.find(request.query_params.get("code", ""))

        # The shipment behind whatever matched - directly, or through the
        # sheet already written for it - in full, so the scanner can show the
        # customer, the stage and the invoice without a second lookup.
        package = found["package"] or (found["sheet"].package if found["sheet"] else None)
        if package is None:
            package = shipments.find_shipment(found["code"])
        shipment = (
            shipments.ShipmentDetailSerializer(
                shipments.detail_queryset().get(pk=package.pk),
                context={"request": request},
            ).data
            if package is not None
            else None
        )

        return Response(
            {
                "code": found["code"],
                "match": found["match"],
                "shipment": shipment,
                "sheet": (
                    self.get_serializer(found["sheet"]).data
                    if found["sheet"] is not None
                    else None
                ),
                "package": (
                    ScannedPackageSerializer(found["package"]).data
                    if found["package"] is not None
                    else None
                ),
                "booking": (
                    ScannedBookingSerializer(found["booking"]).data
                    if found["booking"] is not None
                    else None
                ),
                # Matched through a courier's barcode: whose parcel it is and
                # whether its arrival is recorded (tracking/matching.py).
                "courier": (
                    scan_summary(found["courier"]) if found["courier"] is not None else None
                ),
            }
        )

    @action(detail=False, methods=["post"], url_path="courier-arrival")
    def courier_arrival(self, request):
        """POST {code}: the parcel with this courier barcode is here.

        Records "Received at our warehouse" on that one order's courier
        tracking, with the time and the person who scanned it. Scanning the
        same box again changes nothing and answers `already: true`, with when
        and by whom it was first recorded. 404 when the code is no courier
        number a customer entered - the unmatched box is then handled by hand.
        """
        courier = find_by_courier_number(str(request.data.get("code") or ""))
        if courier is None:
            return Response(
                {"detail": "No customer order has this courier tracking number."},
                status=404,
            )
        _event, already = confirm_arrival(courier, request.user)
        courier.refresh_from_db()
        return Response({"already": already, "courier": scan_summary(courier)})

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """The warehouse home screen: a handful of counts and the latest sheets.

        Its own route rather than the office overview, which is IsStaff and
        says nothing a warehouse account is allowed to know. Everything here
        is about intake sheets, so it sits behind the same permission as they
        do.

        "Today" is the server's local date, the same one received_on defaults
        to, so a sheet started just after midnight counts towards the new day.
        """
        today = timezone.localdate()
        sheets = IntakeSheet.objects.all()
        drafts = sheets.filter(status=IntakeSheet.Status.DRAFT)

        recent = self.get_queryset().order_by("-updated_at")[:5]
        week_start = today - timedelta(days=today.weekday())

        return Response(
            {
                "drafts": drafts.count(),
                "my_drafts": drafts.filter(created_by=request.user).count(),
                "started_today": sheets.filter(created_at__date=today).count(),
                "released_today": sheets.filter(released_at__date=today).count(),
                # The profile page's own numbers: what this person has handed
                # over. Released rather than started, because a draft is not
                # finished work yet.
                "my_released_today": sheets.filter(
                    released_by=request.user, released_at__date=today
                ).count(),
                "my_released_week": sheets.filter(
                    released_by=request.user, released_at__date__gte=week_start
                ).count(),
                "my_released_total": sheets.filter(released_by=request.user).count(),
                "recent": self.get_serializer(recent, many=True).data,
            }
        )

    @action(detail=False, methods=["get"])
    def recipients(self, request):
        """Who a release would be mailed to, for the line above the button.

        Worth a round trip of its own. The commonest way for this whole
        feature to fail silently is a staff account with no work address on
        it: the sheet releases, the dashboard says so, and nobody's inbox ever
        knows. Showing the count - and saying plainly when it is zero - turns
        that into something somebody notices on the first sheet rather than
        the fiftieth.
        """
        addresses = handover_recipients(exclude=request.user)

        return Response({"count": len(addresses), "addresses": addresses})
