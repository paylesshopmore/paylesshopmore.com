"""Quality control: the warehouse manager reviews released intake sheets.

HOW IT FITS IN THE DAY

  The floor fills in an intake sheet and releases it, exactly as before - the
  office is e-mailed at once and nothing waits for a manager. Releasing also
  puts the sheet in the manager's review queue (review_status "awaiting").
  The manager then either:

    approves it                -> "approved" (and "completed" once its
                                  shipment has left the warehouse), or
    sends it back with a note  -> the sheet is reopened (a new version, as
                                  any correction is), marked "needs
                                  correction", and the worker sees the note on
                                  it. When they release it again it is back in
                                  the queue.

  Every verdict is kept (IntakeReview, append-only), with what the checks
  found at that moment.

THE STATUS EVERYBODY SEES (quality_status), worked out from the sheet:

  waiting           a draft nobody has measured anything on yet
  processing        a draft being filled in
  awaiting_review   released; the manager has not looked yet
  needs_correction  sent back by the manager, being fixed
  approved          the manager approved it
  completed         approved, and its shipment has left the warehouse

THE CHECKS (issues) - what the manager is shown, per sheet. They inform; the
manager decides. A check never blocks anything by itself.

  missing_dimensions   no line with length, width and height
  missing_weight       no line with a weight
  missing_supplier     no supplier written down
  missing_destination  no destination
  no_customer          nobody has said whose goods these are
  customer_mismatch    the linked shipment or booking belongs to somebody
                       other than the sheet's customer
  name_differs         the name on the goods shares no name with the
                       customer (worth a look: often a family member)
  duplicate            another sheet has the same number
  incomplete           something the release form needs is still empty
"""

from django.db import transaction
from django.db.models import Count
from django.db.models.functions import Lower
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Package
from staff.permissions import IsWarehouseManager

from .models import IntakeReview, IntakeSheet
from .operations import WarehouseConflict
from .serializers import missing_for_release

Review = IntakeSheet.Review

QUALITY_STATUSES = (
    "waiting",
    "processing",
    "awaiting_review",
    "needs_correction",
    "approved",
    "completed",
)
ISSUES = (
    "missing_dimensions",
    "missing_weight",
    "missing_supplier",
    "missing_destination",
    "no_customer",
    "customer_mismatch",
    "name_differs",
    "duplicate",
    "incomplete",
)
# Worth a look, not necessarily wrong.
SOFT_ISSUES = {"name_differs"}

PAGE_SIZE = 50
# The review list is filtered by issue in Python (the checks are not columns),
# so it looks at no more than this many sheets per request, newest first.
SCAN_LIMIT = 1000


# ------------------------------------------------------------------ status


def quality_status(sheet):
    """The one status a sheet shows (see the module docstring)."""
    if sheet.released:
        if sheet.review_status == Review.AWAITING:
            return "awaiting_review"
        if sheet.review_status == Review.NEEDS_CORRECTION:
            # Released again before being reopened would be odd; it is
            # awaiting the manager either way.
            return "awaiting_review"
        package = sheet.package
        if package is not None and package.warehouse_stage == Package.WarehouseStage.SHIPPED:
            return "completed"
        return "approved"
    if sheet.review_status == Review.NEEDS_CORRECTION:
        return "needs_correction"
    lines = list(sheet.measurements.all())
    if not lines and sheet.revision == 1:
        return "waiting"
    return "processing"


# ------------------------------------------------------------------ checks


def duplicate_references(references=None):
    """Sheet numbers (lower-cased) used by more than one sheet."""
    rows = (
        IntakeSheet.objects.exclude(reference="")
        .annotate(ref=Lower("reference"))
        .values("ref")
        .annotate(n=Count("id"))
        .filter(n__gt=1)
    )
    if references is not None:
        rows = rows.filter(ref__in=[ref.lower() for ref in references if ref])
    return {row["ref"] for row in rows}


def _names(user):
    return [
        part.casefold()
        for part in (user.first_name or "", user.last_name or "")
        if len(part.strip()) >= 2
    ]


def issues(sheet, duplicates=None):
    """What the checks find on this sheet, as a list of codes, in ISSUES order.

    `duplicates`: the set from duplicate_references(), when checking many
    sheets at once (one query for all of them instead of one each).
    """
    found = set()
    lines = list(sheet.measurements.all())
    if not any(None not in (line.length_cm, line.width_cm, line.height_cm) for line in lines):
        found.add("missing_dimensions")
    if not any(line.weight_kg is not None for line in lines):
        found.add("missing_weight")
    if not sheet.supplier.strip():
        found.add("missing_supplier")
    if not sheet.destination.strip():
        found.add("missing_destination")

    customer = sheet.customer
    if customer is None:
        found.add("no_customer")
    else:
        owners = {
            linked.user_id
            for linked in (sheet.package, sheet.booking)
            if linked is not None and linked.user_id is not None
        }
        if owners - {customer.pk}:
            found.add("customer_mismatch")
        recipient = sheet.recipient.casefold()
        names = _names(customer)
        if recipient.strip() and names and not any(name in recipient for name in names):
            found.add("name_differs")

    if sheet.reference.strip():
        if duplicates is None:
            duplicates = duplicate_references([sheet.reference])
        if sheet.reference.lower() in duplicates:
            found.add("duplicate")

    if missing_for_release(sheet):
        found.add("incomplete")

    return [code for code in ISSUES if code in found]


# ------------------------------------------------------------------ decide


def decide(sheet, user, decision, note=""):
    """A manager's verdict on a released sheet: "approve" or "correction".

    approve      only a sheet awaiting review.
    correction   a released sheet (awaiting review, or approved after all):
                 reopened as a new version, with the note for the worker.
                 A note is required - "fix it" without saying what helps
                 nobody.

    Raises WarehouseConflict (409) when the sheet is not in a state the
    verdict applies to - usually somebody else got there first.
    """
    if not user.can_manage_warehouse:
        # The view is shared with the floor; this decision is not.
        raise PermissionDenied("Only a warehouse manager or an admin can review sheets.")
    if decision not in ("approve", "correction"):
        raise ValidationError({"decision": ['Send "approve" or "correction".']})
    note = str(note or "").strip()[:500]
    if decision == "correction" and not note:
        raise ValidationError({"note": ["Say what needs correcting."]})

    with transaction.atomic():
        sheet = (
            IntakeSheet.objects.select_for_update()
            .select_related("customer", "package", "booking")
            .get(pk=sheet.pk)
        )
        found = issues(sheet)
        revision = sheet.revision

        if decision == "approve":
            if not (sheet.released and sheet.review_status == Review.AWAITING):
                raise WarehouseConflict("This sheet is not waiting for review.")
            sheet.review_status = Review.APPROVED
            sheet.review_note = note
        else:
            if not sheet.released:
                raise WarehouseConflict("This sheet is already back with the floor.")
            sheet.reopen()
            sheet.refresh_from_db()
            sheet.review_status = Review.NEEDS_CORRECTION
            sheet.review_note = note

        sheet.reviewed_by = user
        sheet.reviewed_at = timezone.now()
        sheet.save(
            update_fields=["review_status", "review_note", "reviewed_by", "reviewed_at", "updated_at"]
        )
        IntakeReview.objects.create(
            sheet=sheet,
            decision=(
                IntakeReview.Decision.APPROVED
                if decision == "approve"
                else IntakeReview.Decision.CORRECTION
            ),
            note=note,
            issues=found,
            revision=revision,
            user=user,
        )
    return sheet


# ------------------------------------------------------------------ queue


def _row(sheet, duplicates):
    found = issues(sheet, duplicates)
    customer = sheet.customer
    return {
        "id": sheet.pk,
        "reference": sheet.reference,
        "label": sheet.label,
        "quality_status": quality_status(sheet),
        "revision": sheet.revision,
        "customer": (
            {"id": customer.pk, "name": customer.get_full_name() or customer.email,
             "customer_code": customer.customer_code}
            if customer
            else None
        ),
        "supplier": sheet.supplier,
        "destination": sheet.destination,
        "recipient": sheet.recipient,
        "released_at": sheet.released_at,
        "released_by": (sheet.released_by.get_full_name() or sheet.released_by.email)
        if sheet.released_by
        else None,
        "review_note": sheet.review_note,
        "reviewed_at": sheet.reviewed_at,
        "reviewed_by": (sheet.reviewed_by.get_full_name() or sheet.reviewed_by.email)
        if sheet.reviewed_by
        else None,
        "issues": found,
        "problems": [code for code in found if code not in SOFT_ISSUES],
    }


def build_queue(params):
    """One page of sheets for the manager's review list.

    ?status= awaiting_review (default), needs_correction, approved,
             completed or all; ?issue=<one of ISSUES>; ?page=.
    """
    status = params.get("status") or "awaiting_review"
    issue = params.get("issue") or ""
    page = params.get("page") or "1"
    if status not in (*QUALITY_STATUSES, "all"):
        raise ValidationError({"status": ["Not a status the review list knows."]})
    if issue and issue not in ISSUES:
        raise ValidationError({"issue": ["Not a check the review list knows."]})
    if not str(page).isdigit() or int(page) < 1:
        raise ValidationError({"page": ["Must be a page number."]})
    page = int(page)

    sheets = IntakeSheet.objects.select_related(
        "customer", "package", "booking", "released_by", "reviewed_by"
    ).prefetch_related("measurements")
    # Narrow in the database as far as the stored columns allow.
    if status == "awaiting_review":
        sheets = sheets.filter(status=IntakeSheet.Status.RELEASED, review_status=Review.AWAITING)
        ordering = ("released_at", "id")  # longest waiting first
    elif status == "needs_correction":
        sheets = sheets.filter(status=IntakeSheet.Status.DRAFT, review_status=Review.NEEDS_CORRECTION)
        ordering = ("reviewed_at", "id")
    elif status in ("approved", "completed"):
        sheets = sheets.filter(status=IntakeSheet.Status.RELEASED, review_status=Review.APPROVED)
        ordering = ("-reviewed_at", "-id")
    elif status in ("waiting", "processing"):
        sheets = sheets.filter(status=IntakeSheet.Status.DRAFT).exclude(
            review_status=Review.NEEDS_CORRECTION
        )
        ordering = ("created_at", "id")
    else:
        ordering = ("-created_at", "-id")
    sheets = list(sheets.order_by(*ordering)[:SCAN_LIMIT])

    duplicates = duplicate_references([sheet.reference for sheet in sheets])
    rows = [_row(sheet, duplicates) for sheet in sheets]
    if status not in ("all", "awaiting_review", "needs_correction"):
        rows = [row for row in rows if row["quality_status"] == status]
    if issue:
        rows = [row for row in rows if issue in row["issues"]]

    start = (page - 1) * PAGE_SIZE
    return {
        "count": len(rows),
        "page": page,
        "has_next": len(rows) > start + PAGE_SIZE,
        "results": rows[start : start + PAGE_SIZE],
    }


def counts():
    """How many sheets wait for the manager, and how many are back on the floor."""
    return {
        "awaiting_review": IntakeSheet.objects.filter(
            status=IntakeSheet.Status.RELEASED, review_status=Review.AWAITING
        ).count(),
        "needs_correction": IntakeSheet.objects.filter(
            status=IntakeSheet.Status.DRAFT, review_status=Review.NEEDS_CORRECTION
        ).count(),
    }


class ReviewQueueView(APIView):
    """GET: the manager's review list. Admins and warehouse managers."""

    permission_classes = [IsWarehouseManager]

    def get(self, request):
        return Response(build_queue(request.query_params))
