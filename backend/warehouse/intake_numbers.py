"""Intake numbers (001, 002, 003 ...), deleting empty sheets, archiving.

Three jobs, kept together because they share one rule:

    A number may only be used a second time if the first sheet that held it
    never contained anything.

1. allocate(sheet) gives a new sheet its number. It takes the lowest number a
   manager freed (by deleting an empty sheet); if none is free, the next one
   after the highest ever given.

2. delete_empty(sheet, by) deletes a sheet - but only an EMPTY one (see
   empty_sheets below), only for an admin or warehouse manager, and it keeps
   a record (IntakeDeletion) of who deleted what and when. The sheet's number
   is then marked AVAILABLE in the register (IntakeNumber).

3. archive(sheet, by, reason) is for everything else: a sheet that holds real
   information is never deleted, but a manager can put it away.

How two workers pressing "New intake" at the same moment are kept apart:
the register's primary key is the number, and IntakeSheet.number is unique.
If both try to take the same number, the database refuses the second one
(IntegrityError) and allocate() simply tries again with the next number.
On PostgreSQL the free-number lookup also locks the row (select_for_update),
so the second worker waits a moment instead of failing.
"""

import logging
import re

from django.db import IntegrityError, transaction
from django.db.models import Exists, Max, OuterRef, Q
from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from .models import (
    FreedReference,
    IntakeAssignment,
    IntakeDeletion,
    IntakeNumber,
    IntakeReview,
    IntakeSheet,
    IntakeSheetPhoto,
    Measurement,
)

logger = logging.getLogger(__name__)

# How many times allocate() tries again after losing a race for a number.
# Losing more than once or twice would take many workers in the same instant.
ALLOCATE_ATTEMPTS = 10

# Text boxes on the form. A sheet is only empty when every one is blank.
TEXT_FIELDS = (
    "supplier",
    "sender",
    "destination",
    "recipient",
    "notes",
    "check_notes",
    "dimensions_weight",
    "packaging",
    "packaging_other",
    "pickup_location",
    "employees",
    "packed_well",
    "damage_present",
    "address_label_present",
    "freight",
)


# ---------------------------------------------------------------- numbers


def allocate(sheet):
    """Give `sheet` its intake number and return it. Does nothing if it has one.

    Runs in its own savepoint, so a lost race only undoes this attempt and
    not the caller's work.
    """
    if sheet.number:
        return sheet.number

    for _attempt in range(ALLOCATE_ATTEMPTS):
        try:
            with transaction.atomic():
                number = _take_number(sheet)
                # .update() rather than save(): touches only this one column,
                # so it cannot overwrite anything else saved meanwhile.
                IntakeSheet.objects.filter(pk=sheet.pk).update(number=number)
            sheet.number = number
            return number
        except IntegrityError:
            # Somebody else took that number between our look and our write.
            # Nothing was saved (the savepoint rolled back): look again.
            continue

    # Not expected in real life; logged so it is noticed if it ever happens.
    logger.error("Could not give intake sheet %s a number after %s tries", sheet.pk, ALLOCATE_ATTEMPTS)
    raise IntegrityError("No intake number could be allocated.")


def _take_number(sheet):
    """Pick a number for `sheet` and write it into the register."""
    # 1. The lowest number a manager freed by deleting an empty sheet.
    free = (
        IntakeNumber.objects.select_for_update()
        .filter(state=IntakeNumber.State.AVAILABLE)
        .order_by("number")
        .first()
    )
    if free is not None:
        # The filter on state makes this a no-op (0 rows) if another worker
        # took it first; then we raise and allocate() tries again.
        taken = IntakeNumber.objects.filter(
            number=free.number, state=IntakeNumber.State.AVAILABLE
        ).update(
            state=IntakeNumber.State.IN_USE,
            sheet=sheet,
            times_used=free.times_used + 1,
        )
        if taken != 1:
            raise IntegrityError("That free number was just taken.")
        return free.number

    # 2. Otherwise the next number after the highest ever given. Counting the
    #    register (not the sheets) means a number from a deleted sheet that is
    #    NOT free (retired) is never reached again by counting up.
    highest = IntakeNumber.objects.aggregate(top=Max("number"))["top"] or 0
    highest_on_sheets = IntakeSheet.objects.aggregate(top=Max("number"))["top"] or 0
    number = max(highest, highest_on_sheets) + 1
    # create() fails with IntegrityError if another worker just created it.
    IntakeNumber.objects.create(number=number, state=IntakeNumber.State.IN_USE, sheet=sheet)
    return number


# ------------------------------------------------------------------ empty


def empty_sheets(queryset=None):
    """The sheets that hold nothing at all, as a queryset.

    Empty means ALL of this:
      * still a draft, never released, never e-mailed, never reopened
        (revision 1) and never reviewed;
      * no customer, no shipment (package) and no booking linked;
      * every text box blank, no number of colli, no volume, nothing read
        from a label (shipment_details, label_scans);
      * no measurement lines, no photos, no customer-assignment records
        and no review records.

    The shipment number in `reference` does not count: the system writes one
    on every new sheet. Ticking a yes/no box (pickup, upper floor) does not
    count either - it is not information about goods.

    One definition used for the "Empty" count, the "Empty" filter and the
    check before deleting, so they can never disagree.
    """
    if queryset is None:
        queryset = IntakeSheet.objects.all()

    blank_text = Q(**dict.fromkeys(TEXT_FIELDS, ""))
    return (
        queryset.filter(
            blank_text,
            status=IntakeSheet.Status.DRAFT,
            released_at__isnull=True,
            emailed_at__isnull=True,
            revision=1,
            review_status="",
            customer__isnull=True,
            package__isnull=True,
            booking__isnull=True,
            colli_count__isnull=True,
            volume_m3__isnull=True,
            archived_at__isnull=True,
        )
        # JSON fields: an empty dict / list (or nothing) only.
        .filter(Q(shipment_details={}) | Q(shipment_details__isnull=True))
        .filter(Q(label_scans=[]) | Q(label_scans__isnull=True))
        .filter(~Exists(Measurement.objects.filter(sheet=OuterRef("pk"))))
        .filter(~Exists(IntakeSheetPhoto.objects.filter(sheet=OuterRef("pk"))))
        .filter(~Exists(IntakeAssignment.objects.filter(sheet=OuterRef("pk"))))
        .filter(~Exists(IntakeReview.objects.filter(sheet=OuterRef("pk"))))
    )


def is_empty(sheet):
    # Already worked out by the list query (with_empty_flag)? Use that.
    flag = getattr(sheet, "is_empty_sheet", None)
    if flag is not None:
        return flag
    return empty_sheets(IntakeSheet.objects.filter(pk=sheet.pk)).exists()


def with_empty_flag(queryset):
    """Add `is_empty_sheet` (True / False) to every sheet in `queryset`."""
    return queryset.annotate(
        is_empty_sheet=Exists(empty_sheets(IntakeSheet.objects.filter(pk=OuterRef("pk"))))
    )


# --------------------------------------------------------------- deleting


def _require_manager(user):
    """Admins and warehouse managers only. Workers and office get a 403."""
    if not getattr(user, "can_manage_warehouse", False):
        raise PermissionDenied("Only an admin or a warehouse manager can do this.")


class NotEmpty(APIException):
    """The sheet holds information, so it may not be deleted (409)."""

    status_code = 409
    default_detail = "This intake is not empty, so it cannot be deleted. Archive it instead."
    default_code = "intake_not_empty"


def delete_empty(sheet, by):
    """Delete an empty sheet and free its number. Returns the IntakeDeletion.

    403 for anybody but an admin or warehouse manager. 409 (NotEmpty) when
    the sheet holds anything - the page then offers to archive it instead.
    Everything happens in one transaction, and the sheet row is locked first
    so a worker cannot type into it while it is being deleted.
    """
    _require_manager(by)

    with transaction.atomic():
        # Lock the row and check again inside the transaction: what was
        # empty when the page loaded may have been filled in since.
        locked = IntakeSheet.objects.select_for_update().filter(pk=sheet.pk)
        if not empty_sheets(locked).exists():
            raise NotEmpty()
        sheet = locked.get()
        number = sheet.number
        record = IntakeDeletion.objects.create(
            number=number,
            sheet_id_was=sheet.pk,
            reference=sheet.reference,
            created_by=sheet.created_by,
            sheet_created_at=sheet.created_at,
            deleted_by=by,
        )
        reference = sheet.reference
        sheet.delete()
        # Its PLSM shipment number goes back too, for the next new intake.
        free_reference(reference, by)

        if number:
            # Free the number for the next new sheet. The register row stays
            # (it is the number's history); only its state changes.
            IntakeNumber.objects.update_or_create(
                number=number,
                defaults={
                    "state": IntakeNumber.State.AVAILABLE,
                    "sheet": None,
                    "released_at": timezone.now(),
                    "released_by": by,
                },
            )

    logger.info("Intake %s (sheet %s) deleted by user %s", number, record.sheet_id_was, by.pk)
    return record


# ------------------------------------------------- PLSM shipment numbers


def _is_plsm(reference):
    """A number exactly as the office's own series makes it (PLSM-00004:
    five digits), not a courier's tracking number or a reference typed by
    hand (PLSM-0546, PLSM-748383...). Only those come back for reuse."""
    from bookings.models import ShippingNumberSequence

    pattern = rf"{re.escape(ShippingNumberSequence.PREFIX)}\d{{{ShippingNumberSequence.DIGITS}}}"
    return bool(re.fullmatch(pattern, reference or "", re.IGNORECASE))


def free_reference(reference, by):
    """Give a deleted empty intake's PLSM number back, for the next intake.

    Only a PLSM-<digits> number, and only when nothing else (a booking, a
    shipment, another sheet) uses it - then it truly belongs to nobody.
    """
    from bookings.models import ShippingNumberSequence

    reference = (reference or "").strip().upper()
    if not _is_plsm(reference) or ShippingNumberSequence.taken(reference):
        return
    FreedReference.objects.update_or_create(
        reference=reference,
        defaults={"freed_at": timezone.now(), "freed_by": by, "reused_at": None, "reused_by": None},
    )


def take_freed_reference(sheet):
    """The lowest freed PLSM number, now taken by `sheet`; None if none.

    Call inside a transaction. The conditional update means two workers
    starting an intake at the same moment never both get the same number:
    the second one's update changes 0 rows and it tries the next number.
    """
    from bookings.models import ShippingNumberSequence

    for freed in FreedReference.objects.filter(reused_at__isnull=True).order_by("reference"):
        taken = FreedReference.objects.filter(pk=freed.pk, reused_at__isnull=True).update(
            reused_at=timezone.now(), reused_by=sheet
        )
        if not taken:
            continue  # somebody else just took it
        if ShippingNumberSequence.taken(freed.reference):
            continue  # typed on a booking since; leave it marked used
        return freed.reference
    return None


# -------------------------------------------------------------- archiving


def archive(sheet, by, reason):
    """Put a sheet away (a manager's decision). Nothing is deleted.

    Needs a reason, so whoever finds it later knows why. A released sheet can
    be archived too. Its number stays taken for good.
    """
    _require_manager(by)
    reason = str(reason or "").strip()
    if not reason:
        raise ValidationError({"reason": ["Say why this intake is archived."]})
    if len(reason) > 500:
        raise ValidationError({"reason": ["Keep the reason under 500 characters."]})
    if sheet.archived:
        return sheet
    IntakeSheet.objects.filter(pk=sheet.pk).update(
        archived_at=timezone.now(), archived_by=by, archive_reason=reason
    )
    sheet.refresh_from_db()
    return sheet


def unarchive(sheet, by):
    """Bring an archived sheet back to the everyday lists."""
    _require_manager(by)
    IntakeSheet.objects.filter(pk=sheet.pk).update(
        archived_at=None, archived_by=None, archive_reason=""
    )
    sheet.refresh_from_db()
    return sheet


# ------------------------------------------------------------ who may edit


def may_correct(user):
    """May change a sheet that was handed over (reopen it): admins and
    warehouse managers only. Not the office, never a warehouse worker."""
    return bool(getattr(user, "can_manage_warehouse", False))


def may_edit(user, sheet):
    """May change this DRAFT sheet.

    A warehouse worker: only a draft they started themselves - or one nobody
    has signed yet (the office prepared it from a booking; whoever fills it in
    first signs it). Everybody else who can open the warehouse: any draft.
    """
    if not getattr(user, "is_warehouse_worker_only", False):
        return True
    return sheet.created_by_id in (None, user.pk)
