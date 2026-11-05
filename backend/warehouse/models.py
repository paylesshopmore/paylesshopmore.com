"""The warehouse intake sheet, as a record rather than a sheet of paper.

This is the form somebody fills in on the floor when goods arrive: was it
collected or dropped off, is it packed properly, is there damage, how many
colli, how big, by sea or by air. On paper it is a clipboard that then has to
find its way to the people who book the shipment in - and a clipboard on the
wrong desk is a shipment nobody is working on.

So a sheet here has two lives, and `status` is the line between them:

* A **draft** belongs to the warehouse. It is half-filled, it is wrong in
  places, and it is nobody else's business yet. Any staff account may edit it.
* A **released** sheet is a handover. The moment it is released the rest of
  the staff are mailed a copy and can start the process, so from then on the
  sheet is evidence of what was handed over and stops being editable - see
  `release()` below, which is the only way across that line.

Not a one-way door, though. `reopen()` puts a released sheet back into draft
so a mistake can be corrected, and bumps `revision` so that the next release
tells everybody which version they are looking at. The lock is there to stop
a handover being edited under the people acting on it, not to pretend nobody
ever writes down the wrong number.

Nothing here is visible to a customer. There is no customer-facing serializer
and no route outside /api/staff/, which is deliberate: the sheet holds what
staff wrote about a delivery - damage, bad packing, a name off the van - and
that is an internal record, not a shipment update.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q, Value
from django.db.models.functions import Coalesce
from django.utils import timezone


class AlreadyReleased(Exception):
    """Raised when a sheet that has already gone out is released again.

    Its own exception rather than a bare ValueError, so the view can answer
    409 for it specifically and a double-clicked button reads as "this has
    already been sent" rather than as a server error.
    """


class NotReleased(Exception):
    """Raised when a sheet that is already a draft is reopened again.

    The mirror of AlreadyReleased, and answered the same way: 409, because the
    caller asked for something reasonable and somebody else got there first.
    """


class IntakeSheet(models.Model):
    """One intake sheet - one delivery of goods, received at the warehouse."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        RELEASED = "released", "Released to the office"

    class Freight(models.TextChoices):
        # The same two words the paper form prints, and the same values the
        # booking form already stores, so the two can be compared without a
        # translation table in between.
        SEA = "sea", "Zeevracht"
        AIR = "air", "Luchtvracht"

    class Packaging(models.TextChoices):
        PALLET = "pallet", "Pallet"
        BOX = "doos", "Doos"
        COLLI = "colli", "Colli"
        CRATE = "kist", "Kist"
        OTHER = "other", "Anders"

    class Check(models.TextChoices):
        """The Ja / Nee boxes in the middle of the form.

        Three states, not two. A boolean cannot tell "we looked, there is no
        damage" from "nobody has looked yet", and on a form about damage that
        is the difference between a claim the company can defend and one it
        cannot. Blank is the unchecked state, and a new sheet starts there.
        """

        YES = "yes", "Ja"
        NO = "no", "Nee"

    # ------------------------------------------------------------------
    # Where it is in its short life
    # ------------------------------------------------------------------

    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.DRAFT
    )

    # The handwritten box at the top right of the paper form. Free text rather
    # than a generated number: it is whatever was written on the sheet, and
    # half of them will be a booking reference that already exists.
    reference = models.CharField(
        max_length=50,
        blank=True,
        help_text="Whatever is written in the shipment box at the top.",
    )

    # ------------------------------------------------------------------
    # Ophalen - collection
    # ------------------------------------------------------------------

    pickup = models.BooleanField(
        default=False, help_text="Ophalen: collected by us rather than dropped off."
    )
    upper_floor = models.BooleanField(
        default=False,
        help_text="Verdieping: the collection is above the ground floor.",
    )
    # Who went. Names rather than a link to accounts: the men on the van are
    # not all users of this system, and a sheet has to be fillable for a
    # driver who has never signed in.
    employees = models.CharField(
        max_length=255, blank=True, help_text="Werknemers who did the collection."
    )
    pickup_location = models.CharField(max_length=255, blank=True)
    received_on = models.DateField(
        null=True,
        blank=True,
        help_text="Datum aanname goederen - when the goods were taken in.",
    )

    # ------------------------------------------------------------------
    # Inpakken - packing
    # ------------------------------------------------------------------

    packing_required = models.BooleanField(
        default=False, help_text="Inpakken: we pack it."
    )
    pallet_box = models.BooleanField(default=False, help_text="Palletdoos.")
    volume_m3 = models.DecimalField(
        "aantal kuub (m3)",
        max_digits=8,
        decimal_places=3,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
    )

    # ------------------------------------------------------------------
    # The three checks, and what the checker wants to say about them
    # ------------------------------------------------------------------

    packed_well = models.CharField(max_length=3, choices=Check.choices, blank=True)
    damage_present = models.CharField(max_length=3, choices=Check.choices, blank=True)
    address_label_present = models.CharField(
        max_length=3, choices=Check.choices, blank=True
    )
    check_notes = models.TextField(
        blank=True, help_text="Opmerkingen against the three checks above."
    )

    # ------------------------------------------------------------------
    # Who and where
    # ------------------------------------------------------------------

    supplier = models.CharField(max_length=255, blank=True)
    sender = models.CharField(max_length=255, blank=True)
    destination = models.CharField(max_length=255, blank=True)
    recipient = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True, help_text="Opmerkingen about the consignment.")

    # ------------------------------------------------------------------
    # What actually turned up
    # ------------------------------------------------------------------

    colli_count = models.PositiveIntegerField(
        null=True, blank=True, help_text="Aantal colli."
    )
    packaging = models.CharField(max_length=10, choices=Packaging.choices, blank=True)
    # Only meaningful with packaging=other, which is the blank line the paper
    # form leaves after "kist /". Checked in the serializer rather than here,
    # so a draft can still be saved mid-sentence.
    packaging_other = models.CharField(max_length=100, blank=True)

    # One free-text box, exactly as the form has it. Splitting it into length,
    # width, height and weight would be tidier and would be wrong: a sheet
    # covers a pallet and two loose crates as often as it covers one box, and
    # four numeric columns cannot hold "2 pallets 120x80x150, 340kg in total".
    dimensions_weight = models.TextField(
        blank=True, help_text="Afmetingen & gewicht, as written."
    )

    # Sea or air. Decided by the office, never by the floor: the API refuses a
    # change from a warehouse account (IntakeSheetViewSet.perform_update), and
    # the warehouse sees it read-only ("Waiting for office assignment" while it
    # is blank). Blank is allowed for as long as the office has not decided.
    freight = models.CharField(max_length=10, choices=Freight.choices, blank=True)

    # ------------------------------------------------------------------
    # What the scanned shipping label said
    # ------------------------------------------------------------------

    # The courier's own numbers and dates, tapped across from a scanned label
    # (LabelReader.jsx): {"tracking_number": "8796 3229 7750", "ship_date":
    # "03NOV26", ...}. One JSON object rather than a column each, because which
    # of them a label carries differs per courier and none of them is something
    # the system calculates with - they are there to be read and searched.
    # Only the keys in SHIPMENT_DETAIL_KEYS are accepted (serializers.py).
    shipment_details = models.JSONField(default=dict, blank=True)

    # Every label read for this sheet, exactly as the reader returned it
    # (before it was split into chips): [{"lines": [...], "source": "ai" or
    # "device", "read_at": "..."}]. Kept so nothing on a label is lost even
    # when nobody tapped it into a box, and so a wrong box can be checked
    # against what was really printed.
    label_scans = models.JSONField(default=list, blank=True)

    # Naam werknemer - the person who signs the sheet off.
    #
    # Written from the account that creates the sheet and never editable
    # afterwards, which is the opposite of `employees` above and deliberately
    # so. That field records who went out on the van and is somebody else's
    # name to write; this one is a signature. A signature anybody can type
    # over is not evidence of who did the intake, and this sheet is the record
    # of what the company received and in what condition.
    #
    # Stored as text rather than read through `created_by` on the way out, so
    # that the name on a released sheet stays the name that signed it even
    # after the account is renamed, or erased.
    employee_name = models.CharField(max_length=150, blank=True)

    # ------------------------------------------------------------------
    # Optional links to the rest of the system
    # ------------------------------------------------------------------

    # Both nullable, and both stay nullable. Goods arrive at a warehouse
    # without a booking all the time - a supplier delivers against a customer
    # who has not filled the form in yet - and a sheet that cannot be written
    # until the paperwork catches up is a sheet that gets written on paper
    # instead.
    #
    # SET_NULL rather than CASCADE: deleting a booking must not erase the
    # record of goods that physically came through the door.
    booking = models.ForeignKey(
        "bookings.Booking",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="intake_sheets",
    )
    package = models.ForeignKey(
        "accounts.Package",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="intake_sheets",
    )

    # ------------------------------------------------------------------
    # Provenance
    # ------------------------------------------------------------------

    # SET_NULL on both: a sheet outlives the account of whoever filled it in,
    # and losing the name is better than losing the sheet.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="intake_sheets_created",
    )
    released_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="intake_sheets_released",
    )

    released_at = models.DateTimeField(null=True, blank=True)

    # Null until the handover e-mail has actually left. A timestamp rather
    # than a boolean, and the same trick Notification.emailed_at uses: it is
    # what makes sending exactly-once under a worker retry, and a released
    # sheet with this still null is one nobody was mailed about.
    emailed_at = models.DateTimeField(null=True, blank=True)

    # How many times this sheet has been sent. 1 for the ordinary case; 2 or
    # more means it was released, found to be wrong, corrected and sent again.
    #
    # Counted rather than flagged, because the number is what the e-mail needs
    # to say: "corrected" on its own leaves somebody holding two printouts
    # with no way to tell which is the later one.
    revision = models.PositiveIntegerField(default=1)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "intake sheet"
        indexes = [
            # The dashboard's default view: one status, newest first.
            models.Index(fields=["status", "-created_at"]),
        ]

    def __str__(self):
        return f"Intake sheet {self.label}"

    @property
    def label(self):
        """What to call this sheet in a subject line or a heading.

        The reference if somebody wrote one, the row id otherwise. Never
        empty, because an e-mail titled "Intake sheet" tells nobody which.
        """
        return self.reference.strip() or f"#{self.pk}"

    @property
    def released(self):
        return self.status == self.Status.RELEASED

    def release(self, by=None):
        """Hand the sheet over, exactly once.

        A conditional UPDATE rather than a read-then-save, which is what makes
        a double-clicked Release button safe: two requests both read the sheet
        as a draft, and only one of them changes a row. The loser is told so.

        Callers want the e-mail sent as well - that is release_sheet() in
        warehouse/services.py, which wraps this. Kept apart so the state
        change can be tested without an outbox, and so nothing about mail can
        fail a handover that has already happened.
        """
        now = timezone.now()

        moved = IntakeSheet.objects.filter(
            pk=self.pk, status=self.Status.DRAFT
        ).update(
            status=self.Status.RELEASED,
            released_at=now,
            released_by=by,
            updated_at=now,
            # A sheet started before the date was filled in automatically has
            # none: it gets the day it is handed over. One that has a date
            # keeps it.
            received_on=Coalesce(F("received_on"), Value(timezone.localdate())),
        )

        if not moved:
            raise AlreadyReleased(f"Intake sheet {self.label} was already released.")

        # Bring this instance in line with the row, so the caller can
        # serialise what it is holding rather than re-reading it.
        self.status = self.Status.RELEASED
        self.released_at = now
        self.released_by = by
        if self.received_on is None:
            self.received_on = timezone.localdate()
        return self

    def reopen(self):
        """Put a released sheet back into draft, to correct a mistake.

        People write the wrong number of colli on a form. On paper that is a
        line through it and a correction in the margin, and the office is told
        again; refusing to allow it here would not make the record truer, it
        would make people stop using the form.

        So the sheet becomes editable again, and two things are arranged so
        that correcting it cannot pass quietly:

        * `emailed_at` goes back to null. It is the claim that stops the same
          sheet being mailed twice, and a correction has to be able to leave.
        * `revision` goes up. Every later e-mail says which version it is, so
          somebody holding a printout can tell whether they have the current
          one.

        What is not cleared is `released_at` and `released_by`. A correction
        does not unsay the first handover - it happened, and people acted on
        it. Both are overwritten by the next release, which is the record of
        when the version that now stands went out.

        A conditional UPDATE, like release(), so two people pressing Correct
        at the same moment produce one reopen and one refusal rather than a
        revision counted twice.
        """
        now = timezone.now()

        moved = IntakeSheet.objects.filter(
            pk=self.pk, status=self.Status.RELEASED
        ).update(
            status=self.Status.DRAFT,
            emailed_at=None,
            revision=models.F("revision") + 1,
            updated_at=now,
        )

        if not moved:
            raise NotReleased(f"Intake sheet {self.label} is already a draft.")

        self.status = self.Status.DRAFT
        self.emailed_at = None
        # Read back rather than incremented here: the row was updated with an
        # F() expression, and the instance must not guess at what it became.
        self.revision = (
            IntakeSheet.objects.filter(pk=self.pk)
            .values_list("revision", flat=True)
            .first()
        )
        return self


# Carriers charge on whichever is greater, what a box weighs or what it would
# weigh at a standard density: its volume in cm3 divided by a divisor. The
# divisor depends on how the goods travel:
#
#   sea (LCL)  1000  1 m3 counts as 1000 kg (one tonne per cubic metre)
#   air        6000  1 m3 counts as about 167 kg - the IATA figure
#
# The frontend has the same numbers (TRANSPORT_TYPES in
# frontend/src/utils/volumeWeight.js). Change both together.
VOLUMETRIC_DIVISORS = {
    "sea": 1000,
    "air": 6000,
}

# The air divisor on its own, for the package measurements below, which are
# weighed for air freight.
VOLUMETRIC_DIVISOR = VOLUMETRIC_DIVISORS["air"]


class Measurement(models.Model):
    """One line of what was measured on a sheet: so many items of one size.

    A line rather than a box, because goods arrive as "ten identical cartons"
    far more often than as ten different ones, and nobody should type the same
    three numbers ten times. Two pallets and a loose crate is two lines.

    Weight is per item, as it comes off the scale. The totals multiply it out,
    so a worker weighs one carton of the ten and writes down what they read.

    Every number may be blank while the sheet is a draft - somebody measures
    the length before they find the tape for the height. A line only counts as
    complete once all four are filled in, and a sheet needs at least one
    complete line before it can be released.
    """

    sheet = models.ForeignKey(
        IntakeSheet, on_delete=models.CASCADE, related_name="measurements"
    )
    position = models.PositiveIntegerField(default=0)

    quantity = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    packaging = models.CharField(
        max_length=10, choices=IntakeSheet.Packaging.choices, blank=True
    )
    length_cm = models.DecimalField(
        max_digits=7, decimal_places=1, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )
    width_cm = models.DecimalField(
        max_digits=7, decimal_places=1, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )
    height_cm = models.DecimalField(
        max_digits=7, decimal_places=1, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )
    weight_kg = models.DecimalField(
        "weight per item (kg)",
        max_digits=8, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )
    # What the carrier's label states, when it states it. Blank means: work
    # it out (the volume weight from the sizes and the freight, the
    # chargeable weight as the higher of the two). Per item, like weight_kg,
    # and never confused with it: weight_kg is what the scale (or the label's
    # ACTWGT) says the goods weigh.
    volumetric_weight_kg = models.DecimalField(
        "volume weight per item (kg)",
        max_digits=8, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )
    chargeable_weight_kg = models.DecimalField(
        "chargeable weight per item (kg)",
        max_digits=8, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )

    # The numbers above are ALWAYS stored in kg and cm. These say which unit
    # they were read or typed in ("13400 G" is stored as 13.40 kg with
    # weight_unit "g"), so a figure that looks wrong can be traced back to
    # the label.
    class WeightUnit(models.TextChoices):
        KG = "kg", "kg"
        G = "g", "g"

    class DimensionUnit(models.TextChoices):
        CM = "cm", "cm"
        MM = "mm", "mm"
        M = "m", "m"

    weight_unit = models.CharField(
        max_length=2, choices=WeightUnit.choices, default=WeightUnit.KG
    )
    dimension_unit = models.CharField(
        max_length=2, choices=DimensionUnit.choices, default=DimensionUnit.CM
    )
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return f"{self.quantity} × {self.length_cm}×{self.width_cm}×{self.height_cm} cm"

    @property
    def complete(self):
        return None not in (self.length_cm, self.width_cm, self.height_cm, self.weight_kg)

    @property
    def volume_m3(self):
        """Total cubic metres for the line, or None until it is measured."""
        if None in (self.length_cm, self.width_cm, self.height_cm):
            return None
        return self.quantity * self.length_cm * self.width_cm * self.height_cm / 1_000_000

    @property
    def total_weight_kg(self):
        if self.weight_kg is None:
            return None
        return self.quantity * self.weight_kg

    def volumetric_weight_for(self, freight):
        """The line's volume weight for this freight ("sea" or "air").

        The label's own figure when one was entered (times the quantity),
        otherwise worked out from the sizes. None until the line is measured,
        or when there is no stated figure and the freight is not one we have
        a divisor for (not chosen yet).
        """
        if self.volumetric_weight_kg is not None:
            return self.quantity * self.volumetric_weight_kg
        divisor = VOLUMETRIC_DIVISORS.get(freight)
        if divisor is None or None in (self.length_cm, self.width_cm, self.height_cm):
            return None
        return self.quantity * self.length_cm * self.width_cm * self.height_cm / divisor


def measurement_totals(measurements, freight=""):
    """What a sheet's lines add up to, from the complete lines only.

    A half-measured line is left out of every total rather than counted as
    zero: a volume that silently ignores a missing height is a smaller volume
    than the goods, and a price quoted from it is a loss.

    The volume weight - and so the chargeable weight - depends on the
    freight: pass the sheet's own ("sea" or "air"). Without one they are None,
    because there is no rule to work them out by.

    Returns plain Decimals (or None when nothing is measured yet), rounded to
    what the form shows.
    """
    lines = [line for line in measurements if line.complete]
    if not lines:
        return {
            "colli": sum(line.quantity for line in measurements) or None,
            "volume_m3": None,
            "weight_kg": None,
            "volumetric_weight_kg": None,
            "chargeable_weight_kg": None,
        }

    volume = sum((line.volume_m3 for line in lines), Decimal(0))
    weight = sum((line.total_weight_kg for line in lines), Decimal(0))

    # Per line: the label's stated volume weight, else the one the freight
    # gives. Unknown for one line means unknown for the total.
    per_line = [line.volumetric_weight_for(freight) for line in lines]
    if None in per_line:
        volumetric = None
    else:
        volumetric = sum(per_line, Decimal(0)).quantize(Decimal("0.01"))

    if all(line.chargeable_weight_kg is not None for line in lines):
        # Every line carries the carrier's own chargeable figure: use it.
        chargeable = sum(
            (line.quantity * line.chargeable_weight_kg for line in lines), Decimal(0)
        ).quantize(Decimal("0.01"))
    elif volumetric is None:
        chargeable = None
    else:
        chargeable = max(weight, volumetric).quantize(Decimal("0.01"))

    return {
        "colli": sum(line.quantity for line in measurements),
        "volume_m3": volume.quantize(Decimal("0.001")),
        "weight_kg": weight.quantize(Decimal("0.01")),
        "volumetric_weight_kg": volumetric,
        "chargeable_weight_kg": chargeable,
    }


# ===========================================================================
# Warehouse operations on a single package
#
# The intake sheet above describes a delivery as it arrived. The tables below
# are what the floor then does to one package: measure it, pack it, report it
# damaged. Each row belongs to a Package (accounts_package) and to the worker
# who did it (accounts_user), so the office reads the same rows the warehouse
# wrote - one database, no copy.
#
# Table names are set explicitly to the names the operations team uses.
# ===========================================================================


class ImmutableRecord(Exception):
    """An attempt to change or delete a record that is write-once."""


class AppendOnlyQuerySet(models.QuerySet):
    """Refuses bulk update() and delete(), which bypass Model.save().

    A package deleted outright still takes its records with it: Django's
    cascade goes through the SQL delete collector, not through this method.
    """

    def update(self, **kwargs):
        raise ImmutableRecord(f"{self.model.__name__} rows cannot be changed.")

    def delete(self):
        raise ImmutableRecord(f"{self.model.__name__} rows cannot be deleted.")

    def bulk_update(self, *args, **kwargs):
        raise ImmutableRecord(f"{self.model.__name__} rows cannot be changed.")


class AppendOnlyModel(models.Model):
    """Write once. Corrections are new rows, never edits."""

    objects = AppendOnlyQuerySet.as_manager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ImmutableRecord(
                f"{self.__class__.__name__} rows are append-only. Record a new one instead."
            )
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ImmutableRecord(f"{self.__class__.__name__} rows cannot be deleted.")


# The limits a real warehouse package can plausibly have. A value outside them
# is a typing mistake - an extra zero, grams typed as kilograms - and refusing
# it is cheaper than a freight quote built on it.
MIN_WEIGHT_KG = Decimal("0.01")
MAX_WEIGHT_KG = Decimal("5000")
MIN_SIDE_CM = Decimal("0.1")
MAX_SIDE_CM = Decimal("1500")


def volume_m3(length_cm, width_cm, height_cm):
    return (Decimal(length_cm) * Decimal(width_cm) * Decimal(height_cm) / Decimal(1_000_000)).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )


def dimensional_weight_kg(length_cm, width_cm, height_cm):
    return (
        Decimal(length_cm) * Decimal(width_cm) * Decimal(height_cm) / Decimal(VOLUMETRIC_DIVISOR)
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class PackageMeasurement(AppendOnlyModel):
    """One weighing and measuring of one package.

    Append-only: re-measuring writes a new row that `supersedes` the previous
    one, so the history of what the scale said is kept. The current
    measurement is the newest row for the package.
    """

    package = models.ForeignKey(
        "accounts.Package", on_delete=models.CASCADE, related_name="warehouse_measurements"
    )
    # PROTECT: the audit trail must keep naming who measured. Accounts are
    # erased by anonymising, which keeps the row.
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="package_measurements"
    )

    weight_kg = models.DecimalField(
        max_digits=8, decimal_places=2,
        validators=[MinValueValidator(MIN_WEIGHT_KG), MaxValueValidator(MAX_WEIGHT_KG)],
    )
    length_cm = models.DecimalField(
        max_digits=6, decimal_places=1,
        validators=[MinValueValidator(MIN_SIDE_CM), MaxValueValidator(MAX_SIDE_CM)],
    )
    width_cm = models.DecimalField(
        max_digits=6, decimal_places=1,
        validators=[MinValueValidator(MIN_SIDE_CM), MaxValueValidator(MAX_SIDE_CM)],
    )
    height_cm = models.DecimalField(
        max_digits=6, decimal_places=1,
        validators=[MinValueValidator(MIN_SIDE_CM), MaxValueValidator(MAX_SIDE_CM)],
    )
    # Stored as well as derivable, so a report reads what was quoted at the
    # time even if the divisor ever changes.
    volume_m3 = models.DecimalField(max_digits=12, decimal_places=4)
    dimensional_weight_kg = models.DecimalField(max_digits=12, decimal_places=2)

    supersedes = models.OneToOneField(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="superseded_by"
    )
    measured_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "package_measurements"
        ordering = ["-measured_at", "-id"]
        indexes = [models.Index(fields=["package", "-measured_at"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(weight_kg__gt=0) & Q(length_cm__gt=0)
                & Q(width_cm__gt=0) & Q(height_cm__gt=0),
                name="package_measurement_positive",
            ),
        ]

    def __str__(self):
        return f"{self.weight_kg} kg, {self.length_cm}×{self.width_cm}×{self.height_cm} cm"

    def save(self, *args, **kwargs):
        if self._state.adding:
            self.volume_m3 = volume_m3(self.length_cm, self.width_cm, self.height_cm)
            self.dimensional_weight_kg = dimensional_weight_kg(
                self.length_cm, self.width_cm, self.height_cm
            )
        return super().save(*args, **kwargs)

    @property
    def chargeable_weight_kg(self):
        return max(Decimal(self.weight_kg), Decimal(self.dimensional_weight_kg))


class PackagePackaging(AppendOnlyModel):
    """One packaging action: so much bubble wrap, a box, tape."""

    class Type(models.TextChoices):
        BUBBLE_WRAP = "bubble_wrap", "Bubble wrap"
        TAPE = "tape", "Tape"
        BOX = "box", "Box"
        PROTECTION = "protection", "Protection"
        OTHER = "other", "Other"

    package = models.ForeignKey(
        "accounts.Package", on_delete=models.CASCADE, related_name="packaging_records"
    )
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="package_packaging"
    )
    packaging_type = models.CharField(max_length=20, choices=Type.choices)
    quantity = models.PositiveIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(999)]
    )
    notes = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "package_packaging"
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["package", "-created_at"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gte=1), name="package_packaging_quantity_positive"
            ),
        ]

    def __str__(self):
        return f"{self.quantity} × {self.get_packaging_type_display()}"


class PackageDamageReport(models.Model):
    """Damage found on a package, and whether it has been dealt with.

    What was reported is fixed once written. Only the resolution moves, and
    only once, through resolve().
    """

    class DamageType(models.TextChoices):
        BOX_DAMAGED = "box_damaged", "Box damaged"
        CONTENTS_DAMAGED = "contents_damaged", "Contents damaged"
        WET_PACKAGE = "wet_package", "Wet package"
        BROKEN_PACKAGING = "broken_packaging", "Broken packaging"
        OTHER = "other", "Other"

    class Resolution(models.TextChoices):
        OPEN = "open", "Open"
        RESOLVED = "resolved", "Resolved"

    package = models.ForeignKey(
        "accounts.Package", on_delete=models.CASCADE, related_name="damage_reports"
    )
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="damage_reports_filed"
    )
    damage_type = models.CharField(max_length=20, choices=DamageType.choices)
    description = models.TextField(max_length=1000, blank=True)

    resolution_status = models.CharField(
        max_length=10, choices=Resolution.choices, default=Resolution.OPEN, db_index=True
    )
    resolution_note = models.CharField(max_length=500, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="damage_reports_resolved",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    # When the office was e-mailed about it. Claimed with a conditional UPDATE
    # before sending, like IntakeSheet.emailed_at, so a worker retry cannot
    # send a second copy.
    emailed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "package_damage_reports"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["package", "-created_at"]),
            models.Index(fields=["resolution_status", "-created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(resolution_status="open") | Q(resolved_by__isnull=False),
                name="package_damage_resolved_has_resolver",
            ),
        ]

    def __str__(self):
        return f"{self.get_damage_type_display()} ({self.get_resolution_status_display()})"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ImmutableRecord("A damage report cannot be edited. Resolve it instead.")
        return super().save(*args, **kwargs)

    def resolve(self, by, note=""):
        """Close the report, exactly once. Returns False if it was already closed.

        A conditional UPDATE, so two people pressing Resolve at once produce
        one resolution and one refusal.
        """
        now = timezone.now()
        moved = PackageDamageReport.objects.filter(
            pk=self.pk, resolution_status=self.Resolution.OPEN
        ).update(
            resolution_status=self.Resolution.RESOLVED,
            resolution_note=note,
            resolved_by=by,
            resolved_at=now,
        )
        if moved:
            self.resolution_status = self.Resolution.RESOLVED
            self.resolution_note = note
            self.resolved_by = by
            self.resolved_at = now
        return bool(moved)


def damage_photo_path(instance, filename):
    """Stored under the report. The uploader's own filename is never used."""
    return f"damage/{timezone.localtime():%Y/%m}/report-{instance.report_id}/{filename}"


class PackageDamagePhoto(AppendOnlyModel):
    """A photograph attached to a damage report.

    Served only through the authenticated warehouse API, never via MEDIA_URL.
    """

    # The bytes a real file of each type starts with. The extension and the
    # browser's content type are only the caller's word.
    SIGNATURES = {
        "image/jpeg": (b"\xff\xd8\xff",),
        "image/png": (b"\x89PNG\r\n\x1a\n",),
    }
    EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    MAX_BYTES = 10 * 1024 * 1024
    MAX_PER_REPORT = 6

    report = models.ForeignKey(
        PackageDamageReport, on_delete=models.CASCADE, related_name="photos"
    )
    image = models.FileField(upload_to=damage_photo_path)
    content_type = models.CharField(max_length=20)
    size_bytes = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "package_damage_photos"
        ordering = ["id"]

    def __str__(self):
        return f"Photo {self.pk} of damage report {self.report_id}"

    @classmethod
    def sniff(cls, head):
        """The real image type of a file from its first bytes, or None."""
        if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
            return "image/webp"
        for content_type, prefixes in cls.SIGNATURES.items():
            if any(head.startswith(prefix) for prefix in prefixes):
                return content_type
        return None


def package_photo_path(instance, filename):
    """Stored under the package. The uploader's own filename is never used."""
    return f"package-photos/{timezone.localtime():%Y/%m}/package-{instance.package_id}/{filename}"


class PackagePhoto(models.Model):
    """A photo of a customer's package, taken at the warehouse.

    Unlike a damage photo this one is for the customer: it shows up in the
    shipment's pop-up on their profile page ("Mijn zendingen"), so they can
    see their parcel arrived and what it looks like.

    Served only through authenticated routes - the warehouse's
    (/api/staff/warehouse/shipments/<id>/photos/<photo>/) and the owner's
    (/api/packages/<id>/photos/<photo>/) - never via MEDIA_URL.

    Not append-only: a worker who photographs the wrong box can delete it.
    """

    # Same checks and limits as a damage photo (see PackageDamagePhoto.sniff).
    MAX_BYTES = PackageDamagePhoto.MAX_BYTES
    MAX_PER_PACKAGE = 10

    package = models.ForeignKey(
        "accounts.Package", on_delete=models.CASCADE, related_name="photos"
    )
    # Who took it. SET_NULL: a worker leaving must not take the photo with them.
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="package_photos_taken",
    )
    image = models.FileField(upload_to=package_photo_path)
    content_type = models.CharField(max_length=20)
    size_bytes = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "package_photos"
        ordering = ["uploaded_at", "id"]

    def __str__(self):
        return f"Photo {self.pk} of package {self.package_id}"


def intake_photo_path(instance, filename):
    """Stored under the sheet. The uploader's own filename is never used."""
    return f"intake-photos/{timezone.localtime():%Y/%m}/sheet-{instance.sheet_id}/{filename}"


class IntakeSheetPhoto(models.Model):
    """A photo on an intake sheet - of the damage, when "Schade aanwezig?" is Ja.

    Internal, like the sheet itself: served only through the staff intake
    route (/api/staff/intake/<id>/photos/<photo>/), never via MEDIA_URL.

    Not append-only while the sheet is a draft: a photo of the wrong box can
    be deleted. Once the sheet is released it is locked with the rest of it.
    """

    # Same checks and limits as a damage photo (see PackageDamagePhoto.sniff).
    MAX_BYTES = PackageDamagePhoto.MAX_BYTES
    MAX_PER_SHEET = 10

    sheet = models.ForeignKey(IntakeSheet, on_delete=models.CASCADE, related_name="photos")
    # Who took it. SET_NULL: a worker leaving must not take the photo with them.
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="intake_photos_taken",
    )
    image = models.FileField(upload_to=intake_photo_path)
    content_type = models.CharField(max_length=20)
    size_bytes = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["uploaded_at", "id"]

    def __str__(self):
        return f"Photo {self.pk} of intake sheet {self.sheet_id}"


class PackageActivity(AppendOnlyModel):
    """One warehouse action on one package. Immutable.

    Every write the warehouse API makes records one of these in the same
    transaction as the write, so a package's timeline is complete by
    construction rather than by everybody remembering.
    """

    class Action(models.TextChoices):
        PACKAGE_SCANNED = "package_scanned", "Package scanned"
        PACKAGE_RECEIVED = "package_received", "Package received"
        MEASUREMENT_COMPLETED = "measurement_completed", "Measurement completed"
        MEASUREMENT_UPDATED = "measurement_updated", "Measurement updated"
        BUBBLE_WRAP_ADDED = "bubble_wrap_added", "Bubble wrap added"
        PACKAGING_ADDED = "packaging_added", "Packaging added"
        PACKAGE_PACKED = "package_packed", "Package packed"
        DAMAGE_REPORTED = "damage_reported", "Damage reported"
        DAMAGE_RESOLVED = "damage_resolved", "Damage resolved"
        PHOTO_ADDED = "photo_added", "Photo added"
        PHOTO_REMOVED = "photo_removed", "Photo removed"
        PACKAGE_MARKED_READY = "package_marked_ready", "Package marked ready"
        PACKAGE_STATUS_CHANGED = "package_status_changed", "Package status changed"
        LOCATION_CHANGED = "location_changed", "Location changed"
        PROBLEM_REPORTED = "problem_reported", "Problem reported"
        PROBLEM_RESOLVED = "problem_resolved", "Problem resolved"

    package = models.ForeignKey(
        "accounts.Package", on_delete=models.CASCADE, related_name="activity"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="package_activity"
    )
    action = models.CharField(max_length=32, choices=Action.choices, db_index=True)
    description = models.CharField(max_length=500)
    # The facts behind the sentence (from/to stage, a measurement id), so a
    # report never has to parse the description.
    context = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "package_activity"
        ordering = ["-timestamp", "-id"]
        verbose_name_plural = "package activity"
        indexes = [
            models.Index(fields=["package", "timestamp"]),
            models.Index(fields=["user", "-timestamp"]),
        ]

    def __str__(self):
        return f"{self.package_id}: {self.get_action_display()}"


class WarehouseAccess(models.Model):
    """What warehouse workers may see and use - one setting for all of them.

    Set by an admin on Dashboard -> Warehouse access. Applies only to
    warehouse-only accounts (User.is_warehouse_worker_only); the office and
    admins always see everything. Enforced on the server (warehouse/access.py)
    as well as hidden in the warehouse app, so a switched-off section cannot
    be reached by typing its address either.

    One row (pk=1), read with WarehouseAccess.current(). A section missing
    from `sections` is on: a new switch added later starts out allowing, as
    the warehouse worked before it existed.
    """

    # key -> (title, what it covers). The order is the order on the page.
    SECTIONS = {
        "measurements": (
            "Measuring",
            "Measure and weigh packages, and the Measurements list.",
        ),
        "packaging": (
            "Packaging",
            "Record packaging and bubble wrap, and the Packaging list.",
        ),
        "damage": (
            "Damage reports",
            "Report damage with photos, and the Damage list.",
        ),
        "photos": (
            "Package photos",
            "Take photos of a package for the customer to see.",
        ),
        "activity": (
            "Activity log",
            "The log of everything done on the floor, and a package's history.",
        ),
        "intake": (
            "Intake sheets",
            "The paper intake sheets, typed in.",
        ),
        "customer_contact": (
            "Customer phone number",
            "The customer's phone number on the package page.",
        ),
        "invoices": (
            "Invoices",
            "Which invoice belongs to a package, and its status.",
        ),
    }

    sections = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        db_table = "warehouse_access"
        verbose_name_plural = "warehouse access"

    def __str__(self):
        return "Warehouse access"

    @classmethod
    def current(cls):
        """The one settings row, made on first use."""
        access, _ = cls.objects.get_or_create(pk=1)
        return access

    def allows(self, section):
        return bool((self.sections or {}).get(section, True))

    def as_dict(self):
        """Every section with its on/off value, unknown keys left out."""
        return {key: self.allows(key) for key in self.SECTIONS}
