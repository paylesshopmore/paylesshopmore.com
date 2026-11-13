"""Invoices, and the state machine an invoice is allowed to move through.

An invoice is a document about money that leaves the building, so who approved
it and when is part of the record rather than something reconstructed later
from a log. The states are:

    DRAFT -> PENDING_REVIEW -> APPROVED -> SENT
                            -> REJECTED -> PENDING_REVIEW (after correction)

The rules live on the model, not in the view. A view is one caller; the admin,
a management command, a data fix in the shell and the next milestone's sending
job are all callers too. Putting the check where the data is means there is no
way in that skips it.
"""

import logging
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import IntegrityError, models, transaction
from django.db.models import Q
from django.utils import timezone

from accounts.events import record_event
from accounts.models import PackageEvent

logger = logging.getLogger(__name__)


def invoice_pdf_path(instance, filename):
    """Where a rendered invoice is written, under MEDIA_ROOT.

    Foldered by year so the directory does not grow into a single flat listing
    of every invoice ever raised, and named after the tracking number so a file
    found on disk can be traced back to a shipment without a database lookup.
    Django appends a suffix rather than overwriting if the name is already
    taken, so a re-render leaves the previous file alone instead of destroying
    the document a customer may already have been sent.
    """
    return f"invoices/{timezone.localtime(instance.created_at):%Y}/{filename}"


class InvalidInvoiceTransition(Exception):
    """A move the state machine does not allow.

    Raised by the transition methods below. staff/views.py turns it into a
    409, because it means the caller's idea of the invoice's state is stale —
    not that the request was malformed.
    """


class Invoice(models.Model):
    """The invoice for one shipment, and its position in the review flow."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_REVIEW = "pending_review", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        SENT = "sent", "Sent"

    # Which moves are legal, as data rather than as a chain of ifs. Read as
    # "to enter this state, the invoice must currently be in one of these".
    ALLOWED_FROM = {
        Status.PENDING_REVIEW: (Status.DRAFT, Status.REJECTED),
        Status.APPROVED: (Status.PENDING_REVIEW,),
        Status.REJECTED: (Status.PENDING_REVIEW,),
        Status.SENT: (Status.APPROVED,),
    }

    # CASCADE rather than PROTECT, for the same reason Package.delivery_address
    # is SET_NULL: PROTECT here would make deleting a customer impossible,
    # because that cascade reaches their packages and would stop dead on this
    # row. An invoice for a shipment that no longer exists is not a record of
    # anything anyway. The normal erasure path is User.anonymise(), which keeps
    # every package and so every invoice.
    package = models.OneToOneField(
        "accounts.Package",
        on_delete=models.CASCADE,
        related_name="invoice",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    # PROTECT: this is the audit trail. A staff account that has approved
    # invoices cannot be deleted out from under them, which is the point of
    # recording who approved it. Erasure goes through User.anonymise(), which
    # keeps the row and so keeps this pointer valid.
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reviewed_invoices",
        limit_choices_to={"is_staff": True},
        help_text="The staff member who approved or rejected it.",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    # Required when rejecting: whoever corrects the invoice has to be told what
    # is wrong with it, or the rejection is just a closed door.
    rejection_reason = models.TextField(blank=True)

    # Who raised it by hand, when somebody did.
    #
    # Null for the ordinary invoice, and that null is information rather than a
    # gap: an invoice raised by ensure_invoice_for_package is a consequence of
    # a shipment being marked paid, and there is no person behind it to name.
    # The staff member who marked the shipment is on the timeline immediately
    # before it. A name here means somebody sat down and made this one.
    #
    # PROTECT, like reviewed_by and for the same reason: this is part of the
    # record of who did what, and an account that has raised invoices cannot be
    # deleted out from under them. Erasure goes through User.anonymise(), which
    # keeps the row.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_invoices",
        limit_choices_to={"is_staff": True},
        help_text="The staff member who raised it by hand. Empty when it was raised automatically.",
    )

    # The date the invoice is *for*, which is not always the date the row was
    # written. An invoice entered on Monday for work done the previous Friday
    # carries Friday's date; created_at still says Monday, and the two are kept
    # apart on purpose so neither has to lie about the other.
    #
    # Null on an automatically raised invoice, where the two are the same thing
    # and inventing a second copy of created_at would only give something else
    # the chance to disagree with it. Read through `dated_on` below rather than
    # directly, which answers with created_at when this is empty.
    invoice_date = models.DateField(
        null=True,
        blank=True,
        help_text="The date on the document. Defaults to the day it was raised.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    # The rendered document, written by invoicing.tasks.render_approved_invoice
    # once the invoice is approved. Empty until then: an invoice under review is
    # not a document anybody should be able to fetch, so there is nothing to
    # fetch. Not a CharField holding a path — a FileField goes through
    # DEFAULT_FILE_STORAGE, so moving media to S3 later is a settings change
    # rather than a rewrite of everything that touches this column.
    pdf = models.FileField(
        upload_to=invoice_pdf_path,
        blank=True,
        help_text="Rendered on approval. Not written by hand.",
    )

    # ---- what the document is, as opposed to where it is ----------------
    #
    # `pdf` already answers "where", and everything below can be derived from
    # it by asking storage. That is exactly the reason to record it: asking
    # storage means a network round trip per row once media lives in a bucket,
    # so a list of forty invoices showing a file size would make forty calls
    # to S3 to render one page. These are written once, when the document is
    # attached, and read from the row forever after.
    #
    # They also answer a question the file cannot. `pdf.name` is the name we
    # chose; storage may have suffixed it to avoid a collision, and the name
    # the customer should see is the one below.

    document_filename = models.CharField(
        max_length=255,
        blank=True,
        help_text="The name the document is offered under. Not its storage path.",
    )

    document_size = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Size in bytes, recorded when the document was attached.",
    )

    document_content_type = models.CharField(
        max_length=100,
        blank=True,
        help_text="Always application/pdf today. Stored rather than assumed.",
    )

    # Distinct from created_at, which is when the invoice row was written.
    # An invoice can be raised on Monday, rejected, corrected and given its
    # final document on Thursday, and "when did the customer's copy come into
    # existence" is Thursday.
    document_uploaded_at = models.DateTimeField(null=True, blank=True)

    # Distinct from created_by, which names whoever raised the invoice, and
    # from reviewed_by, which names whoever approved it. This is whoever put
    # this particular file on it — the same person in the ordinary case, and
    # not the same person when a document is replaced after the fact.
    #
    # Null when the render task drew it: there is no person behind an
    # automatic render, and naming the approver here would claim they chose a
    # file they never saw. PROTECT for the same reason as the other two: this
    # is the audit trail, and erasure goes through User.anonymise().
    document_uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="uploaded_invoice_documents",
        limit_choices_to={"is_staff": True},
        help_text="Who attached this file. Empty when it was rendered automatically.",
    )

    # ---- an invoice composed in the dashboard ----------------------------
    #
    # Everything below is filled in by the invoice editor
    # (frontend/src/pages/Dashboard/invoice/) and stays empty on an invoice
    # that was raised automatically or uploaded as a ready-made PDF.
    # `composed` is what tells the two kinds apart.
    #
    # These are *copies*, taken when the invoice is written: the weight is
    # copied from the shipment, the terms from the invoice settings, and so
    # on. That is deliberate. An invoice is a record of what we told the
    # customer on that day; if somebody later corrects the shipment's weight
    # or rewrites the terms, invoices already sent must not change with it.

    composed = models.BooleanField(
        default=False,
        help_text="Written in the dashboard's invoice editor rather than uploaded.",
    )

    # The sequential number, e.g. PLSM20260011. Null on the older
    # INV-<year>-<pk> invoices, which keep the number they were issued under -
    # see invoicing.pdf.invoice_number.
    reference = models.CharField(
        max_length=30,
        unique=True,
        null=True,
        blank=True,
        help_text="The sequential invoice number, e.g. PLSM20260011.",
    )

    # -- who and where --
    bill_to = models.TextField(blank=True, help_text="Name and address, one per line.")
    phone = models.CharField(max_length=30, blank=True)
    relation_number = models.CharField(max_length=50, blank=True)
    order_number = models.CharField(max_length=50, blank=True)
    shipment_number = models.CharField(max_length=50, blank=True)

    class Freight(models.TextChoices):
        SEA = "sea", "Zeevracht"
        AIR = "air", "Luchtvracht"

    freight = models.CharField(max_length=10, choices=Freight.choices, blank=True)
    port_of_loading = models.CharField(max_length=100, blank=True)
    port_of_discharge = models.CharField(max_length=100, blank=True)
    goods_description = models.CharField(max_length=300, blank=True)

    # -- the goods: three different measurements, keep them apart --
    #   pieces            how many boxes/pallets ("Stuks")
    #   weight_kg         the actual weight, off the scale ("Gewicht")
    #   volume_m3         the space they take, in cubic metres ("Volume")
    #   volume_weight_kg  L x W x H / 6000 - what air freight is charged on
    pieces = models.PositiveIntegerField(null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    volume_m3 = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    volume_weight_kg = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    # The box sizes the volume was worked out from, when they were measured:
    # [{"length_cm": "120", "width_cm": "80", "height_cm": "100", "count": 2}]
    # Kept so somebody checking the invoice can see where the numbers came from.
    measurements = models.JSONField(default=list, blank=True)

    # -- insurance (the premium itself is a line of kind "insurance") --
    insured_value = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    own_risk = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # -- VAT --
    # Only a shipment somebody has confirmed as an export outside the EU gets
    # the export rate (0%); everything else gets the standard rate. The rate
    # is copied here from InvoiceSettings when the invoice is saved, so a
    # later change of rate does not alter invoices already written.
    export_verified = models.BooleanField(
        default=False,
        help_text="Confirmed as an export outside the EU, so the export VAT rate applies.",
    )
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    # -- the wording printed under the totals, copied from InvoiceSettings --
    # {"payment_instructions": "...", "terms_intro": "...", ...}; the keys
    # are InvoiceSettings.TEXT_FIELDS.
    texts = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            # The one query the review queue makes.
            models.Index(fields=["status", "-created_at"]),
        ]
        constraints = [
            # The state machine's invariants, enforced by the database. The
            # transition methods below are what code should call; these are the
            # backstop for a bulk update(), a fixture or a hand-written
            # migration that goes around them.
            #
            # Literals rather than Status.APPROVED and friends: a constraint is
            # frozen into a migration, and a name that is later renamed in this
            # file would leave the migration referring to something that no
            # longer exists.
            models.CheckConstraint(
                condition=(
                    ~Q(status__in=["approved", "sent"])
                    | Q(reviewed_by__isnull=False, reviewed_at__isnull=False)
                ),
                name="invoice_reviewed_when_approved_or_sent",
            ),
            models.CheckConstraint(
                condition=(
                    ~Q(status="rejected")
                    | (
                        Q(reviewed_by__isnull=False, reviewed_at__isnull=False)
                        & ~Q(rejection_reason="")
                    )
                ),
                name="invoice_rejected_needs_reason",
            ),
            models.CheckConstraint(
                condition=~Q(status="sent") | Q(sent_at__isnull=False),
                name="invoice_sent_needs_sent_at",
            ),
            # "Sent" is a claim that a document left the building, so there has
            # to be a document. Without this, a failed render followed by a
            # mark_sent() would leave an invoice the customer is told was sent
            # and nothing to show them.
            models.CheckConstraint(
                condition=~Q(status="sent") | ~Q(pdf=""),
                name="invoice_sent_needs_pdf",
            ),
            # Nothing still awaiting a verdict carries one. This is what makes a
            # corrected invoice a clean slate rather than one still showing the
            # previous reviewer's name.
            models.CheckConstraint(
                condition=(
                    ~Q(status__in=["draft", "pending_review"])
                    | Q(
                        reviewed_by__isnull=True,
                        reviewed_at__isnull=True,
                        rejection_reason="",
                    )
                ),
                name="invoice_unreviewed_has_no_verdict",
            ),
        ]

    def __str__(self):
        return f"Invoice for {self.package.tracking_number} ({self.get_status_display()})"

    @property
    def dated_on(self):
        """The date the invoice carries.

        `invoice_date` when somebody set one, and the day the row was written
        otherwise. One property rather than the same `or` written out at each
        of the four places that display a date, which is how two of them end
        up disagreeing.
        """
        if self.invoice_date:
            return self.invoice_date
        return timezone.localtime(self.created_at).date() if self.created_at else None

    @property
    def amount_due(self):
        """What the customer is asked to pay ("Totaal te betalen").

        On a composed invoice: worked out from its lines by
        invoicing.calculation - the same function that draws the PDF's
        totals. On any other invoice: the shipment's value, which is what those
        invoices have always shown as their total. None when there is no figure.
        """
        if not self.composed:
            return self.package.value_eur
        return self.totals()["total"]

    def totals(self):
        """The financial summary of a composed invoice. See calculation.py."""
        from .calculation import calculate_totals

        lines = list(self.lines.all())
        adjustment = InvoiceLine.Kind.ADJUSTMENT
        return calculate_totals(
            charges=[line.amount for line in lines if line.kind != adjustment],
            adjustments=[line.amount for line in lines if line.kind == adjustment],
            vat_rate_percent=self.vat_rate,
        )

    # ---- the state machine ---------------------------------------------

    def _transition(self, to_status, **fields):
        """Move to `to_status`, or raise if that move is not allowed.

        Written as a conditional UPDATE — "set these columns on this row, but
        only while it is still in a state that permits the move" — rather than
        as a check followed by a save. The check-then-save version has a race:
        two staff members press Approve at the same moment, both read
        PENDING_REVIEW, both pass the check, and the invoice is approved twice
        with the second reviewer's name quietly overwriting the first. Here the
        database decides, in one statement, and the loser matches zero rows and
        gets an error.
        """
        allowed = self.ALLOWED_FROM[to_status]

        # Checked in Python first only so the ordinary case produces a message
        # naming both states. The UPDATE below is what actually holds.
        if self.status not in allowed:
            raise InvalidInvoiceTransition(
                f"An invoice cannot go from {self.get_status_display()} to "
                f"{self.Status(to_status).label}."
            )

        updated = self.__class__.objects.filter(
            pk=self.pk, status__in=allowed
        ).update(status=to_status, updated_at=timezone.now(), **fields)

        if not updated:
            # Someone else moved it between our read and our write.
            raise InvalidInvoiceTransition(
                "This invoice was changed by someone else. Reload and try again."
            )

        # The in-memory copy is now stale in exactly the columns that were
        # written, so it is re-read rather than patched up field by field.
        self.refresh_from_db()
        return self

    def submit_for_review(self):
        """DRAFT or REJECTED -> PENDING_REVIEW.

        A rejected invoice comes back with a clean slate: the previous reviewer
        and reason are cleared, so the queue shows an invoice waiting for a
        verdict rather than one still wearing the old one. Keeping the history
        of every rejection would need a table of its own, which this milestone
        does not have.
        """
        # Read before the transition, which is what erases the evidence: a
        # first submission and a resubmission are the same UPDATE, and only
        # the state it came from tells them apart.
        was_rejected = self.status == self.Status.REJECTED

        self._transition(
            self.Status.PENDING_REVIEW,
            reviewed_by=None,
            reviewed_at=None,
            rejection_reason="",
        )

        # Only a resubmission is news. The DRAFT -> PENDING_REVIEW hop every
        # invoice makes inside ensure_invoice_for_package is part of being
        # raised, and is recorded there — a second line saying the same thing
        # would put every invoice on the timeline twice.
        if was_rejected:
            record_event(
                self.package,
                PackageEvent.Kind.INVOICE_RESUBMITTED,
                invoice_id=self.pk,
            )

        return self

    def approve(self, reviewed_by):
        """PENDING_REVIEW -> APPROVED, and queue the PDF that follows from it.

        The render is scheduled here rather than in the view for the same
        reason the transition rules are on the model: the view is one caller.
        The admin, a management command and a data fix in the shell all reach
        approval through this method, and an approved invoice that never gets
        rendered because it was approved from the wrong place is a silent hole.

        Queued through transaction.on_commit, so the worker cannot start before
        the transaction that approved the invoice has landed. Scheduled
        directly, the task can and does win that race: it reads a row still
        showing PENDING_REVIEW and declines to do anything, and the invoice is
        left approved with no document and no job coming.
        """
        self._transition(
            self.Status.APPROVED,
            reviewed_by=reviewed_by,
            reviewed_at=timezone.now(),
            rejection_reason="",
        )

        # After the transition, never before: _transition is the conditional
        # UPDATE that decides who actually won, so only the winner gets here
        # and the history cannot record two approvals for one invoice.
        record_event(
            self.package,
            PackageEvent.Kind.INVOICE_APPROVED,
            actor=reviewed_by,
            invoice_id=self.pk,
        )

        # Imported here, not at module scope: tasks.py imports this module, and
        # at import time Celery's autodiscovery is still walking the app list.
        from .tasks import render_approved_invoice

        transaction.on_commit(lambda: self._queue_render(render_approved_invoice))

        return self

    def _queue_render(self, task):
        """Hand the render to a worker, and survive there not being one.

        A broker that is down makes .delay() raise, and this runs from an
        on_commit hook — after the approval is committed but still inside the
        request, so the exception would surface as a 500 for a reviewer whose
        approval actually succeeded. Worse, it would tell them to try again on
        an invoice that is no longer in a state where approving is allowed.

        So it is caught and logged. The invoice stays APPROVED with no PDF,
        which is the same recoverable state a failed render leaves behind, and
        the same one a re-queue fixes. Approving is the reviewer's decision and
        it stands; the document is a consequence of it, and a missing
        consequence is repairable in a way that a lost decision is not.
        """
        try:
            task.delay(self.pk)
        except Exception:
            logger.exception(
                "Invoice %s was approved but its render could not be queued. "
                "It is still APPROVED and can be re-queued.",
                self.pk,
            )

    def reject(self, reviewed_by, reason):
        """PENDING_REVIEW -> REJECTED. The reason is not optional."""
        reason = (reason or "").strip()
        if not reason:
            raise InvalidInvoiceTransition("A rejection has to say what is wrong.")

        self._transition(
            self.Status.REJECTED,
            reviewed_by=reviewed_by,
            reviewed_at=timezone.now(),
            rejection_reason=reason,
        )

        # The row this table exists for. submit_for_review() clears
        # rejection_reason the moment a corrected invoice comes back, so
        # without this line the reviewer's actual words are gone and an invoice
        # rejected three times looks like one that was approved first time.
        record_event(
            self.package,
            PackageEvent.Kind.INVOICE_REJECTED,
            actor=reviewed_by,
            reason=reason,
            invoice_id=self.pk,
        )

        return self

    def replace_document(self, pdf_name):
        """Swap the document on an invoice the customer already has.

        Only from SENT, and the status does not move: this is a correction to
        a document that has already gone out, not a second sending. The
        customer is deliberately not notified again — "your invoice has been
        sent" is not true a second time, and telling them a document changed
        without being able to say how is worse than the office telephoning
        them, which is what actually happens.

        Written as the same conditional UPDATE as every transition, so two
        people replacing at once cannot interleave, and so an invoice that has
        been moved out of SENT in the meantime is refused rather than quietly
        given a document it should not have.
        """
        if not pdf_name:
            raise InvalidInvoiceTransition("There is no document to attach.")

        updated = self.__class__.objects.filter(
            pk=self.pk, status=self.Status.SENT
        ).update(pdf=pdf_name, updated_at=timezone.now())

        if not updated:
            raise InvalidInvoiceTransition(
                "Only an invoice that has already been sent can have its "
                "document replaced. Reload and try again."
            )

        self.refresh_from_db()
        return self

    def record_document(self, *, filename, uploaded_by=None, content_type="application/pdf"):
        """Stamp what was just attached to `pdf` onto the row.

        Called immediately after `pdf.save()` by every path that puts a
        document on an invoice — the render task, the Add invoice form and the
        replace-document action. Kept as one method rather than three copies
        of the same five assignments, because three copies is how the render
        task ends up recording a size and the upload form does not.

        The size is read from storage rather than from the upload, so it is
        the size of the bytes that actually landed. A file that was truncated
        on the way in is then visible as a row whose size disagrees with what
        the browser sent, instead of a row confidently reporting a number for
        a document nobody can open.

        A separate UPDATE rather than part of a transition: this is
        description, not state. Nothing in the state machine depends on it,
        the constraints do not mention it, and a storage backend that cannot
        answer for a size must not be able to refuse an approval.
        """
        size = None
        try:
            size = self.pdf.size
        except (OSError, ValueError):
            # Storage cannot say. Recorded as unknown, which is honest, rather
            # than as zero, which reads as an empty file.
            logger.warning(
                "Invoice %s: could not read the size of %s.", self.pk, self.pdf.name
            )

        uploaded_at = timezone.now()

        self.__class__.objects.filter(pk=self.pk).update(
            document_filename=filename,
            document_size=size,
            document_content_type=content_type,
            document_uploaded_at=uploaded_at,
            document_uploaded_by=uploaded_by,
        )

        # Written onto the in-memory copy rather than re-read with
        # refresh_from_db, which would be the obvious thing and is wrong here.
        # Every caller has just done `pdf.save(..., save=False)`, so the name
        # of the file that was written lives only in memory — the column is
        # still empty, because the transition that follows is what writes it.
        # A refresh would replace that name with the empty column and the next
        # line would try to send an invoice with no document.
        self.document_filename = filename
        self.document_size = size
        self.document_content_type = content_type
        self.document_uploaded_at = uploaded_at
        self.document_uploaded_by = uploaded_by

        return self

    def send_attached(self):
        """APPROVED -> SENT, using the document already on the row.

        mark_sent() takes a storage name because its usual caller has just
        written the bytes and is the only one who knows what they were stored
        under. This is the other case: an invoice approved with its document
        already attached, waiting for somebody to decide it should go. There
        is nothing to write, so there is nothing to name.

        Refused when there is no document, by mark_sent and by the
        invoice_sent_needs_pdf constraint behind it. "Sent" is a claim that
        something left the building.
        """
        if not self.pdf:
            raise InvalidInvoiceTransition(
                "This invoice has no document, so there is nothing to send. "
                "Upload one first."
            )

        return self.mark_sent(self.pdf.name)

    def mark_sent(self, pdf_name):
        """APPROVED -> SENT, recording the document that was sent.

        `pdf_name` is a storage name, not a file: the caller writes the bytes
        through the storage backend first and passes back the name it was given.
        That keeps this a single UPDATE, so it stays the same conditional write
        as every other transition and cannot be won twice.

        Required rather than optional, and matched by the invoice_sent_needs_pdf
        constraint: there is no such thing as a sent invoice with nothing to
        show for it.
        """
        if not pdf_name:
            raise InvalidInvoiceTransition(
                "An invoice cannot be marked sent without a rendered document."
            )

        self._transition(self.Status.SENT, sent_at=timezone.now(), pdf=pdf_name)

        # No actor: a worker finishing a render is the system completing a job
        # somebody else decided on, not a person making a decision. The
        # approval two lines up the timeline is where the name belongs.
        record_event(
            self.package,
            PackageEvent.Kind.INVOICE_SENT,
            invoice_id=self.pk,
        )

        # Telling the customer is part of sending, not a step the caller has to
        # remember. _transition is a conditional UPDATE that only one caller can
        # win, so this runs exactly once per invoice however many workers race
        # for it — no guard against a duplicate is needed here.
        #
        # Imported at call time, not module scope: notifications.services reads
        # invoicing.pdf, and importing it up here would make this module import
        # itself through the back door.
        from notifications.services import notify_invoice_sent

        notify_invoice_sent(self)

        return self


class InvoiceLine(models.Model):
    """One line of money on a composed invoice.

    Three kinds, printed in different places:

    * charge      - a service: "Zeevracht", "Handling Fee". Never negative.
    * insurance   - the insurance premium, written by the insurance section of
                    the editor. Counted in the subtotal like a charge.
    * adjustment  - "Contractuele verrekening conform overeenkomst", printed
                    under the subtotal. May be negative or positive, and only
                    an admin may add or change one.
    """

    class Kind(models.TextChoices):
        CHARGE = "charge", "Charge"
        INSURANCE = "insurance", "Insurance"
        ADJUSTMENT = "adjustment", "Contractual adjustment"

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="lines")
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.CHARGE)
    position = models.PositiveSmallIntegerField(default=0)
    description = models.CharField(max_length=300)
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["position", "pk"]

    def __str__(self):
        return f"{self.description}: {self.amount}"


class InvoiceNumberSequence(models.Model):
    """The last invoice number handed out, per year.

    Dutch bookkeeping wants invoice numbers that run on without gaps, so the
    number comes from this counter, read and bumped under a row lock, rather
    than from a database id (ids skip whenever a save is rolled back).

    One row per year when the number contains the year (PLSM2026 0011), or a
    single row with year=0 when it does not (PLSM 0011). How a number *looks*
    is configured in InvoiceSettings; this class only counts.

    Editable in the Django admin, so the counter can be set to carry on from
    invoices written before the website made them: an office that is at
    PLSM20260011 on paper sets 2026 to 11, and the next invoice is 0012.
    """

    year = models.PositiveSmallIntegerField(
        primary_key=True, help_text="0 when invoice numbers do not contain the year."
    )
    last_number = models.PositiveIntegerField(
        default=0,
        help_text="The last number used. The next invoice gets this plus one.",
    )

    class Meta:
        verbose_name = "invoice number sequence"

    def __str__(self):
        return f"{self.year or 'all years'}: last used {self.last_number}"

    @staticmethod
    def key_for(settings_row, year):
        """Which counter row a year uses: its own, or the shared row 0."""
        return year if settings_row.number_include_year else 0

    @classmethod
    def peek(cls, year):
        """The number the next invoice would get, without taking it.

        For the editor and the preview only. Two people looking at the same
        moment both see the same number; only the first to save gets it.
        """
        settings_row = InvoiceSettings.load()
        row = cls.objects.filter(year=cls.key_for(settings_row, year)).first()
        return settings_row.format_number(year, (row.last_number if row else 0) + 1)

    @classmethod
    def next_value(cls, year):
        """The plain counter behind the next number: 15 for PLSM20260015.

        What the invoice settings page shows and lets an admin change.
        """
        settings_row = InvoiceSettings.load()
        row = cls.objects.filter(year=cls.key_for(settings_row, year)).first()
        return (row.last_number if row else 0) + 1

    @classmethod
    def _locked_row(cls, year):
        """This year's counter row, created if needed and locked for the
        rest of the transaction. Shared by take(), set_next() and claim()."""
        key = cls.key_for(InvoiceSettings.load(), year)
        try:
            with transaction.atomic():
                cls.objects.get_or_create(year=key)
        except IntegrityError:
            # Another request created the row between our check and our
            # insert. It exists now, which is all we needed.
            pass
        return cls.objects.select_for_update().get(year=key)

    @classmethod
    def set_next(cls, year, number):
        """Make `number` the one the NEXT invoice gets (an admin's choice on the
        settings page). Must run inside a transaction.

        Example: the paper invoices ended at 14, so set_next(2026, 15) and the
        next invoice is PLSM20260015.

        Setting it HIGHER than the real last number leaves a gap, on purpose:
        that is how you carry on from invoices written elsewhere. Setting it
        LOWER is safe: take() steps past any number an invoice already uses.
        """
        row = cls._locked_row(year)
        row.last_number = max(int(number) - 1, 0)
        row.save(update_fields=["last_number"])

    @classmethod
    def claim(cls, year, text):
        """Use an invoice number somebody typed by hand. Must run inside a
        transaction. Returns the number (unchanged).

        If it is in our own format (prefix + year + digits, e.g. PLSM20260015)
        and is higher than the counter, the counter moves up to it, so the
        invoice after it is 0016 and numbering carries on from there.
        A number in any other shape (a custom reference) leaves the counter
        alone.
        """
        parsed = InvoiceSettings.load().parse_number(year, text)
        if parsed is not None:
            row = cls._locked_row(year)
            if parsed > row.last_number:
                row.last_number = parsed
                row.save(update_fields=["last_number"])
        return text

    @classmethod
    def take(cls, year):
        """Hand out the next number for `year`. Must run inside a transaction.

        Step by step:
          1. Make sure the counter row exists (the first invoice of a year
             creates it).
          2. Lock that row (select_for_update), so a second invoice saved at
             the same moment waits here instead of reading the same counter.
          3. Add one. If that number is somehow already used - an admin set the
             counter back - keep adding one until it is free.
          4. Save the counter. If the surrounding transaction fails later, this
             save is rolled back too, so the number is not lost: no gap.
        """
        settings_row = InvoiceSettings.load()
        key = cls.key_for(settings_row, year)

        try:
            with transaction.atomic():
                cls.objects.get_or_create(year=key)
        except IntegrityError:
            # Another request created the row between our check and our
            # insert. It exists now, which is all we needed.
            pass

        row = cls.objects.select_for_update().get(year=key)
        number = row.last_number + 1
        while Invoice.objects.filter(
            reference=settings_row.format_number(year, number)
        ).exists():
            number += 1

        row.last_number = number
        row.save(update_fields=["last_number"])
        return settings_row.format_number(year, number)


class InvoiceSettings(models.Model):
    """How invoices are numbered, taxed and worded. One row, edited by admins.

    Read it with InvoiceSettings.load(). Changed on the dashboard's invoice
    settings page (admins only - see staff/invoice_config.py) or in the Django
    admin.

    Nothing financial or legal is hard-coded in the PDF code: the VAT rates,
    the insurance rule and every sentence under the totals live here, so the
    business can change them without a programmer.
    """

    # ---- numbering ----
    number_prefix = models.CharField(max_length=10, default="PLSM")
    number_include_year = models.BooleanField(
        default=True, help_text="PLSM20260011 rather than PLSM0011."
    )
    number_digits = models.PositiveSmallIntegerField(
        default=4,
        validators=[MinValueValidator(1), MaxValueValidator(8)],
        help_text="How many digits the counter is padded to: 4 gives 0011.",
    )

    # ---- VAT ----
    standard_vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("21.00"),
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Used unless the shipment is confirmed as an export.",
    )
    export_vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Used only when 'export verified' is ticked on the invoice.",
    )

    # ---- insurance ----
    # Empty on purpose. Nobody has told us the business's insurance rate, so
    # we do not make one up: with no rate, the office types the fee by hand.
    insurance_rate_percent = models.DecimalField(
        max_digits=6,
        decimal_places=3,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Premium as a percentage of the insured value. Empty: typed by hand.",
    )
    insurance_minimum = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text="The lowest premium charged when a rate is set.",
    )

    # ---- wording ----
    # "{zendingsnummer}" and "{bedrijf}" in these texts are replaced by the
    # shipment number and the company name when the invoice is drawn.
    payment_instructions = models.TextField(
        default=(
            "Gelieve bij betaling het zendingsnummer ({zendingsnummer}) "
            "te vermelden als omschrijving."
        )
    )
    terms_intro = models.TextField(
        default="Wanneer u een zending doet met {bedrijf}, gaat u akkoord met:"
    )
    terms_items = models.TextField(
        default="De Algemene voorwaarden van {bedrijf}\nDe Fenex-condities",
        help_text="One condition per line.",
    )
    exclusions_title = models.TextField(
        default=(
            "{bedrijf} is niet verantwoordelijk voor de volgende mogelijke "
            "bijkomende kosten:"
        )
    )
    exclusions_items = models.TextField(
        default=(
            "Opslag en/of havenkosten\n"
            "Invoerrechten en/of belasting op plaats van bestemming\n"
            "Douane-inspectiekosten (strippen en/of scannen)\n"
            "Alle vrijkomende lokale kosten op plaats van aankomst\n"
            "Lokale terminal handlingskosten op plaats van aankomst"
        ),
        help_text="One cost per line.",
    )
    export_vat_note = models.TextField(
        default=(
            "0% Nederlandse omzetbelasting wegens diensten die rechtstreeks verband "
            "houden met de uitvoer van goederen buiten de Europese Unie."
        ),
        help_text="Printed under the totals of an export (0% VAT) invoice.",
    )
    footer_text = models.TextField(
        default=(
            "On all our warehousing services the Warehousing Conditions {bedrijf} will "
            "apply. A copy is available on request. You can also observe or download "
            "these conditions at https://paylessshopmore.com/terms. On all other "
            "services the Forwarding Conditions of {bedrijf} will apply.\n"
            "We hereby explicitly and continuously reject the applicability of any "
            "general terms and conditions that are or may be referred to at any time "
            "by you and your company."
        ),
        help_text="The small print at the bottom of the page. One paragraph per line.",
    )

    #: The wording copied onto each invoice when it is written (Invoice.texts).
    TEXT_FIELDS = (
        "payment_instructions",
        "terms_intro",
        "terms_items",
        "exclusions_title",
        "exclusions_items",
        "export_vat_note",
        "footer_text",
    )

    class Meta:
        verbose_name = "invoice settings"
        verbose_name_plural = "invoice settings"

    def __str__(self):
        return "Invoice settings"

    def save(self, *args, **kwargs):
        # Always the same row, so there can never be two sets of settings.
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        """The settings, created with the defaults the first time they are read."""
        row, _ = cls.objects.get_or_create(pk=1)
        return row

    def format_number(self, year, number):
        """PLSM + 2026 + 0011, as configured."""
        year_part = str(year) if self.number_include_year else ""
        return f"{self.number_prefix}{year_part}{number:0{self.number_digits}d}"

    def parse_number(self, year, text):
        """The counter value inside a number in OUR format, or None.

        parse_number(2026, "PLSM20260015") -> 15
        parse_number(2026, "PLSM2026015")  -> None  (not padded like ours)
        parse_number(2026, "OLD-77")       -> None  (a custom reference)

        Only an exact match counts: format_number() must give the same text
        back, so a lookalike never moves the counter.
        """
        year_part = str(year) if self.number_include_year else ""
        prefix = f"{self.number_prefix}{year_part}"
        digits = text[len(prefix):] if text.startswith(prefix) else ""
        if not digits.isdigit():
            return None
        number = int(digits)
        return number if self.format_number(year, number) == text else None

    def vat_rate_for(self, export_verified):
        """The rate an invoice gets. The export rate only when somebody confirmed it."""
        return self.export_vat_rate if export_verified else self.standard_vat_rate

    def text_snapshot(self):
        """The wording to copy onto a new invoice."""
        return {name: getattr(self, name) for name in self.TEXT_FIELDS}


class FreightScope(models.TextChoices):
    """Which shipping method a port or a charge belongs to."""

    SEA = "sea", "Zeevracht"
    AIR = "air", "Luchtvracht"
    BOTH = "both", "Zee- en luchtvracht"


class Port(models.Model):
    """A port (or airport) offered in the editor's Laadhaven/Loshaven lists.

    Managed by admins on the invoice settings page, so a new destination is a
    form to fill in, not a code change.
    """

    name = models.CharField(max_length=100, unique=True, help_text='e.g. "Willemstad, CUR"')
    freight = models.CharField(
        max_length=4, choices=FreightScope.choices, default=FreightScope.SEA
    )
    for_loading = models.BooleanField(default=False, help_text="Offered as Laadhaven.")
    for_discharge = models.BooleanField(default=True, help_text="Offered as Loshaven.")
    # The booking form's destination code (CW, AW, ...). Lets the editor pick
    # this port by itself for a shipment booked to that island.
    destination_code = models.CharField(max_length=10, blank=True)
    is_default = models.BooleanField(
        default=False,
        help_text="Pre-selected when nothing better is known (Rotterdam / Willemstad).",
    )
    position = models.PositiveSmallIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "name"]

    def __str__(self):
        return self.name


class ChargeType(models.Model):
    """A service the editor offers as a charge line: "Zeevracht", "Laadkosten".

    `freight` decides when it is offered: a sea-only charge such as
    Bunkertoeslag does not appear on an air freight invoice. Managed by admins
    on the invoice settings page.
    """

    name = models.CharField(max_length=200, unique=True)
    freight = models.CharField(
        max_length=4, choices=FreightScope.choices, default=FreightScope.BOTH
    )
    # Filled in as the amount when the charge is added. Empty: typed by hand.
    default_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )
    position = models.PositiveSmallIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "name"]

    def __str__(self):
        return self.name


class InvoiceHistory(models.Model):
    """Who did what to an invoice, and what it looked like afterwards.

    One row per save, edit or deletion of a composed invoice. `snapshot` is
    the whole invoice as JSON at that moment, so an earlier version can be
    read back even after it was edited. Rows outlive the invoice itself (the
    link becomes empty) so a deletion stays on record, with its number.
    """

    class Action(models.TextChoices):
        CREATED = "created", "Created"
        UPDATED = "updated", "Edited"
        DELETED = "deleted", "Deleted"

    invoice = models.ForeignKey(
        Invoice, on_delete=models.SET_NULL, null=True, blank=True, related_name="history"
    )
    reference = models.CharField(max_length=30, blank=True)
    action = models.CharField(max_length=10, choices=Action.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+",
    )
    at = models.DateTimeField(auto_now_add=True)
    snapshot = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-at", "-pk"]
        verbose_name_plural = "invoice history"

    def __str__(self):
        return f"{self.reference} {self.get_action_display()} at {self.at:%Y-%m-%d %H:%M}"
