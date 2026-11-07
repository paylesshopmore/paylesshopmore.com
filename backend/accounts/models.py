"""Customer accounts, their addresses and their packages.

The user model is a custom one from the very start. Django can only switch
AUTH_USER_MODEL cleanly before the first migration is applied; changing it
later means dropping the database or a painful manual migration.
"""

from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models, transaction
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

# Numbers are written a dozen ways across the islands and the Netherlands
# (+599 9 123 4567, 010-7670371, (599) 9123456), so this only checks the shape
# is plausible. The count of digits is the part worth enforcing.
phone_validator = RegexValidator(
    regex=r"^\+?[\d\s()-]{7,20}$",
    message="Enter a valid phone number, for example +599 9 123 4567.",
)


class User(AbstractUser):
    """A customer.

    username, first_name, last_name and the hashed password come from
    AbstractUser. Django never stores the password itself, only a salted
    PBKDF2 hash, and only ever through set_password().
    """

    # AbstractUser leaves email optional and non-unique. For this site it is
    # how people are contacted about a shipment, so it is required and unique.
    email = models.EmailField("email address", unique=True)

    phone_number = models.CharField(
        max_length=20,
        validators=[phone_validator],
        help_text="Used by the agent at the destination to arrange handover.",
    )

    # The warehouse floor: somebody who does intake and nothing else.
    #
    # A second flag rather than a value in one `role` column, because it sits
    # alongside `is_staff` which is Django's own and cannot be folded into
    # something else. The two are read together and mean three things:
    #
    #   is_staff                 the back office. The whole dashboard, and
    #                            Django's own /admin/.
    #   is_warehouse             the floor. The scanner and intake sheets,
    #                            and nothing else - deliberately not /admin/,
    #                            which is why this is not `is_staff`.
    #   both                     a supervisor who does both jobs.
    #
    # Neither flag is a permission on its own. staff/permissions.py is where
    # each of them is turned into an answer, and the server checks on every
    # request - a phone in a warehouse is the likeliest device in the company
    # to be picked up by somebody else.
    is_warehouse = models.BooleanField(
        "warehouse staff",
        default=False,
        help_text="Can scan packages and write intake sheets.",
    )

    # The named role, which is what people actually assign. The two flags
    # above stay, because Django's admin and every existing permission check
    # read them, but they are now written *from* the role (see _sync_role):
    #
    #   admin       is_staff. The whole back office, including who gets which
    #               role. Every account that had is_staff before roles existed
    #               became an admin, so nobody lost anything in the move.
    #   office      both flags. The whole back office except role management,
    #               and the warehouse floor with it - an office worker does
    #               intake and scans packages alongside the desk work, so the
    #               floor is part of the job rather than a second job.
    #   warehouse   is_warehouse. Warehouse operations and nothing else.
    #   manager     is_warehouse. The warehouse manager: the floor's admin.
    #               Everything a warehouse worker does, never limited by the
    #               Warehouse access switches, plus running the floor - the
    #               warehouse workers' accounts, sign-in codes and PINs, the
    #               floor devices and locations, and those switches. Not
    #               is_staff, so still no invoices, customers or /admin/.
    #   driver      neither flag. Deliberately no warehouse or office access.
    #   customer    neither flag.
    class Role(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        ADMIN = "admin", "Admin"
        OFFICE = "office", "Office worker"
        WAREHOUSE = "warehouse", "Warehouse worker"
        DRIVER = "driver", "Driver"
        # "manager" because the column is ten characters wide; the label is
        # what anybody reads.
        MANAGER = "manager", "Warehouse manager"

    # (is_staff, is_warehouse) for each role.
    ROLE_FLAGS = {
        Role.CUSTOMER: (False, False),
        Role.ADMIN: (True, False),
        # Both: the desk and the floor. is_staff alone already opened the
        # warehouse screens - can_use_warehouse below reads either flag - so
        # this changes no permission. What it changes is that the account now
        # *says* warehouse, which is what every list of warehouse people is
        # drawn from: the handover mails, the Workers page, the admin.
        Role.OFFICE: (True, True),
        Role.WAREHOUSE: (False, True),
        # The floor, not the office: is_staff would open /admin/ and every
        # office screen, which is exactly what this role is not for.
        Role.MANAGER: (False, True),
        Role.DRIVER: (False, False),
    }

    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.CUSTOMER,
        db_index=True,
    )

    # What this customer agreed to be contacted about. Shipping updates are on
    # by default because they are about an order the customer placed;
    # marketing is opt-in, which is what the GDPR requires.
    notify_shipping = models.BooleanField(default=True)
    notify_offers = models.BooleanField(default=False)
    notify_newsletter = models.BooleanField(default=False)

    # Warehouse handovers, which are work rather than marketing: a released
    # intake sheet is mailed to the staff who have to act on it. On by
    # default, and meaningless on a customer account because only staff are
    # ever mailed one - see warehouse/recipients.py, which reads this flag
    # alongside is_staff.
    #
    # Kept beside the three above rather than on a table of its own: it is one
    # boolean about one person, and a staff account is a User like any other.
    notify_warehouse = models.BooleanField(default=True)

    # The language the customer reads the site in, so e-mails about their
    # shipments arrive in it too. Set by the React app whenever a signed-in
    # customer is using the site in a language this does not match yet.
    # Blank for accounts that have not been seen since this was added: those
    # are written to in Dutch, the site's default (see notifications/messages.py).
    class Language(models.TextChoices):
        DUTCH = "nl", "Nederlands"
        ENGLISH = "en", "English"
        PAPIAMENTU = "pap", "Papiamentu"

    language = models.CharField(max_length=5, choices=Language.choices, blank=True)

    # Set when the account has been erased. The row survives only to keep
    # shipment records intact; it holds no personal data after this point.
    anonymised_at = models.DateTimeField(null=True, blank=True)

    # The customer's own number, counting up from 1 in the order accounts
    # were made: shown as PLSM-C00001 (see customer_code). Customers put it in
    # front of their name in a webshop's checkout, so the warehouse can tell
    # whose parcel a box is even when two customers share a name. Given once,
    # when the account is made (save() below), and never reused.
    customer_number = models.PositiveIntegerField(unique=True, null=True, blank=True, editable=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "customer"
        verbose_name_plural = "customers"
        constraints = [
            # `unique=True` above compares exactly, so "Anna@example.com" and
            # "anna@example.com" could both exist - two accounts that every
            # e-mail lookup (sign-in, password reset, sign-in codes) treats as
            # one address, and resolves to whichever it finds first. The
            # serializers lowercase and check; this is what holds if one of
            # them is ever bypassed.
            models.UniqueConstraint(Lower("email"), name="user_email_ci_unique"),
        ]

    def __str__(self):
        if self.anonymised_at:
            return f"deleted customer #{self.pk}"
        full_name = self.get_full_name()
        return full_name or self.username

    # ---- roles ------------------------------------------------------------

    @property
    def is_admin(self):
        """May manage other accounts' roles. Superusers always may."""
        return bool(self.is_active and (self.is_superuser or self.role == self.Role.ADMIN))

    @property
    def can_use_warehouse(self):
        return bool(self.is_active and (self.is_staff or self.is_warehouse))

    @property
    def is_warehouse_manager(self):
        """Runs the warehouse floor (see Role above). Not the office."""
        return bool(self.is_active and self.role == self.Role.MANAGER and self.is_warehouse)

    @property
    def can_manage_warehouse(self):
        """May run the floor: workers, codes, PINs, devices, access switches."""
        return bool(self.is_admin or self.is_warehouse_manager)

    @property
    def is_warehouse_worker_only(self):
        """The floor without the office: limited to warehouse stages.

        Not a warehouse manager, who has the floor without its limits - every
        stage, never the access switches - though still not the office.
        """
        return bool(self.is_warehouse and not self.is_staff and self.role != self.Role.MANAGER)

    def _role_from_flags(self):
        if self.is_superuser or self.is_staff:
            # An office worker keeps being an office worker when some other
            # flag moves; only a customer given is_staff directly (the Django
            # admin, a fixture) becomes an admin, as is_staff always meant.
            return self.role if self.role in (self.Role.ADMIN, self.Role.OFFICE) else self.Role.ADMIN
        if self.is_warehouse:
            # A manager stays a manager when some other flag moves.
            return self.role if self.role == self.Role.MANAGER else self.Role.WAREHOUSE
        return self.Role.DRIVER if self.role == self.Role.DRIVER else self.Role.CUSTOMER

    def _sync_role(self):
        """Keep `role` and the two flags saying the same thing.

        Whichever side was changed wins. A new row with a role set is written
        from the role; a new row created the old way, with is_staff=True, gets
        the role those flags mean. Returns the columns that were rewritten.
        """
        loaded = getattr(self, "_loaded_role", None)
        flags = (self.is_staff, self.is_warehouse, self.is_superuser)

        if loaded is None:
            role_changed = self.role != self.Role.CUSTOMER
            flags_changed = not role_changed
        else:
            role_changed = self.role != loaded[0]
            flags_changed = flags != loaded[1:]

        if role_changed:
            self.is_staff, self.is_warehouse = self.ROLE_FLAGS[self.role]
            if self.is_superuser:
                # A superuser keeps /admin/ whatever role label it carries.
                self.is_staff = True
            return {"is_staff", "is_warehouse"}
        if flags_changed:
            role = self._role_from_flags()
            if role != self.role:
                self.role = role
                return {"role"}
        return set()

    @classmethod
    def from_db(cls, db, field_names, values):
        instance = super().from_db(db, field_names, values)
        row = dict(zip(field_names, values))
        if {"role", "is_staff", "is_warehouse", "is_superuser"} <= set(row):
            instance._loaded_role = (
                row["role"], row["is_staff"], row["is_warehouse"], row["is_superuser"]
            )
        return instance

    # PLSM-C00001: "C" for customer, so it is never mistaken for one of our
    # shipment numbers (PLSM-00001) by a person or by the warehouse scanner.
    CUSTOMER_CODE_PREFIX = "PLSM-C"

    @property
    def customer_code(self):
        """The customer number as written on a parcel: PLSM-C00001, PLSM-C123456 (five digits at least)."""
        if self.customer_number is None:
            return None
        return f"{self.CUSTOMER_CODE_PREFIX}{self.customer_number:05d}"

    def save(self, *args, **kwargs):
        touched = self._sync_role()

        update_fields = kwargs.get("update_fields")
        if update_fields is not None and touched:
            kwargs["update_fields"] = set(update_fields) | touched | {"role"}

        if self._state.adding and self.customer_number is None:
            # A new account: the next customer number, taken in the same
            # transaction as the row itself, so a failed save gives it back.
            with transaction.atomic():
                self.customer_number = CustomerNumberSequence.next_number()
                super().save(*args, **kwargs)
        else:
            super().save(*args, **kwargs)
        self._loaded_role = (self.role, self.is_staff, self.is_warehouse, self.is_superuser)

    @property
    def default_address(self):
        """The address to pre-fill on a new order, if one is set."""
        return self.addresses.filter(is_default=True).first()

    def anonymise(self):
        """Strip every piece of personal data, keeping the row itself.

        Used instead of a hard delete when the customer has shipments. Those
        are commercial records a shipping company has to keep — Dutch tax law
        requires seven years — but they do not need to carry a name, an
        e-mail address or a phone number to do that.

        The addresses are deleted outright; each package already holds its own
        frozen copy of where it was sent.
        """
        from django.utils import timezone

        self.addresses.all().delete()

        # Unique columns need unique replacements, so the primary key goes
        # into both. .invalid is reserved by RFC 2606 and can never be a real
        # domain, so this address cannot collide with a live one.
        self.username = f"deleted-{self.pk}"
        self.email = f"deleted-{self.pk}@deleted.invalid"
        self.first_name = ""
        self.last_name = ""
        self.phone_number = ""

        # Unusable password: no hash will ever match, so the account cannot be
        # logged into again.
        self.set_unusable_password()

        self.is_active = False
        self.role = self.Role.CUSTOMER
        self.is_warehouse = False
        self.notify_shipping = False
        self.notify_offers = False
        self.notify_newsletter = False
        self.notify_warehouse = False
        self.anonymised_at = timezone.now()

        self.save()


class CustomerNumberSequence(models.Model):
    """The customer numbers, counting up: 1, 2, 3 ... (shown as PLSM-C00001).

    One row. next_number() takes the next one with the row locked, so two
    people signing up at the same moment never get the same number - the same
    way as the shipping numbers (bookings.ShippingNumberSequence).
    """

    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "customer number counter"

    def __str__(self):
        return f"Last customer number: {self.last_number}"

    @classmethod
    def next_number(cls):
        """The next free customer number. Call inside a transaction."""
        from django.db.models import Max

        row, _ = cls.objects.select_for_update().get_or_create(pk=1)
        # Never below a number already given out (say, one restored from a backup).
        highest = User.objects.aggregate(top=Max("customer_number"))["top"] or 0
        row.last_number = max(row.last_number, highest) + 1
        row.save(update_fields=["last_number"])
        return row.last_number


class Address(models.Model):
    """One of a customer's delivery addresses.

    Separate table rather than columns on User: a customer can have several,
    and how many is not known up front.
    """

    class Country(models.TextChoices):
        # ISO 3166-1 alpha-2 stored, readable label shown.
        CURACAO = "CW", "Curaçao"
        BONAIRE = "BQ", "Bonaire"
        ARUBA = "AW", "Aruba"
        SINT_MAARTEN = "SX", "Sint Maarten"
        SURINAME = "SR", "Suriname"
        NETHERLANDS = "NL", "Nederland"

    user = models.ForeignKey(
        # settings.AUTH_USER_MODEL by string, so this file does not import the
        # user model directly and create a circular import.
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="addresses",
    )

    label = models.CharField(
        max_length=50,
        blank=True,
        help_text='Optional name for this address, such as "Home" or "Office".',
    )
    street = models.CharField(max_length=255)
    house_number = models.CharField(max_length=20)
    postal_code = models.CharField(max_length=20, blank=True)
    city = models.CharField(max_length=100)
    country = models.CharField(
        max_length=2,
        choices=Country.choices,
        default=Country.CURACAO,
    )

    is_default = models.BooleanField(
        default=False,
        help_text="Pre-filled when this customer places an order.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "addresses"
        ordering = ["-is_default", "city"]
        constraints = [
            # Enforced by the database, not just by save(): two concurrent
            # requests could otherwise each set a different default.
            models.UniqueConstraint(
                fields=["user"],
                condition=Q(is_default=True),
                name="unique_default_address_per_user",
            )
        ]

    def __str__(self):
        return f"{self.street} {self.house_number}, {self.city}"

    def save(self, *args, **kwargs):
        """Keep exactly one default per customer.

        Setting a new default clears the old one; the first address a customer
        adds becomes the default automatically.
        """
        if self.is_default:
            self.__class__.objects.filter(user=self.user, is_default=True).exclude(
                pk=self.pk
            ).update(is_default=False)
        elif not self.__class__.objects.filter(user=self.user).exclude(pk=self.pk).exists():
            self.is_default = True

        super().save(*args, **kwargs)


class PackageQuerySet(models.QuerySet):
    """A queryset that will not quietly step around the lock.

    Package.save() is where the rule is enforced, and a bulk update() does not
    call it — `Package.objects.filter(...).update(status="paid")` would move a
    delivered shipment back with no exception and no history. That is exactly
    the bypass the feature exists to close, so update() refuses when the rows
    it would touch include locked ones and the columns it would write include
    protected ones.

    Deliberately not a blanket refusal: staff still set estimated_arrival in
    bulk, and the notification worker still stamps rows that are in transit.
    Only the frozen columns and the status are held.

    The escape hatch is force_update(), for a data migration that genuinely
    has to rewrite history and says so in its own name.
    """

    #: What a bulk update may not touch on a locked row.
    PROTECTED = ("status", "user", "user_id", "delivery_address",
                 "delivery_address_id", "delivery_address_text", "description",
                 "weight_kg", "value_eur")

    def update(self, **fields):
        if set(fields) & set(self.PROTECTED):
            locked = self.filter(status__in=Package.LOCKED_STATUSES)
            # exists(), not count(): the number is not wanted, only whether
            # this update would land on anything it must not.
            if locked.exists():
                raise ShipmentLocked(
                    "This update would change a shipment that has already "
                    "left. Shipments that are in transit, arrived, delivered "
                    "or cancelled cannot be altered."
                )
        return super().update(**fields)

    def force_update(self, **fields):
        """update() with the lock lifted. For migrations and repairs only."""
        return super().update(**fields)


class ShipmentLocked(Exception):
    """A change to an order that has gone too far to be changed.

    Raised by Package.check_can_change() and by the model's own save(), and
    turned into a 409 by staff/views.py: the request was well formed and the
    caller was allowed to make it, the order simply is not something anybody
    can still alter.
    """


class InvalidShipmentTransition(Exception):
    """A status move the state machine does not allow.

    Separate from ShipmentLocked because the two mean different things to a
    reader: this one is "an order cannot go from delivered back to paid", not
    "this order is finished". Both become a 409.
    """


class Package(models.Model):
    """A shipment belonging to a customer."""

    class Status(models.TextChoices):
        QUOTED = "quoted", "Quote sent"
        PAID = "paid", "Paid"
        PURCHASED = "purchased", "Products purchased"
        # Packed and waiting for the boat or the plane. The stage the paper
        # process always had and the database did not: between "we have bought
        # your things" and "they have left", there is a window where the office
        # can still add a late parcel to the crate and the customer can not.
        # Without it, that window had no name and so no rule could be hung on
        # it — see the lock tiers below, where it is the only staff-only stage.
        READY_FOR_SHIPPING = "ready_for_shipping", "Ready for shipping"
        IN_TRANSIT = "in_transit", "In transit"
        ARRIVED = "arrived", "Arrived at destination"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    # Which statuses mean the money has come in, kept here with the data
    # rather than in whichever view happens to be adding up totals.
    #
    # The flow is quoted -> paid -> purchased -> ready for shipping -> in
    # transit -> arrived -> delivered, so everything from PAID onwards is a shipment that has been
    # settled; a package cannot reach those states unpaid. QUOTED is the
    # customer holding a quote they have not acted on yet, which is the only
    # state that is money genuinely outstanding.
    #
    # CANCELLED is in neither list on purpose. It is not owed and it was not
    # earned, so counting it either way would misstate the books - a cancelled
    # shipment belongs in the count of shipments and in neither total.
    PAID_STATUSES = (
        Status.PAID,
        Status.PURCHASED,
        Status.READY_FOR_SHIPPING,
        Status.IN_TRANSIT,
        Status.ARRIVED,
        Status.DELIVERED,
    )
    AWAITING_PAYMENT_STATUSES = (Status.QUOTED,)

    # ---- what may still be changed, and by whom -------------------------
    #
    # A shipment is not a document that stays editable for ever. Once the
    # crate is closed, once it is on the water, once it has been handed over,
    # changing what the row says about it stops being a correction and starts
    # being a lie about a thing that already happened. So the stages are
    # sorted into three tiers, once, here — not re-decided by whichever view
    # happens to be handling the request.
    #
    #   OPEN            the customer may still add to this shipment.
    #   STAFF_ONLY      closed to the customer; the office may still act.
    #   LOCKED          closed to everybody. The shipment is a record now.
    #
    # Read them through can_change() and check_can_change() rather than
    # testing membership by hand, so that a stage added later is handled in
    # one place instead of in every caller that forgot about it.
    OPEN_STATUSES = (Status.QUOTED, Status.PAID, Status.PURCHASED)
    STAFF_ONLY_STATUSES = (Status.READY_FOR_SHIPPING,)
    LOCKED_STATUSES = (
        Status.IN_TRANSIT,
        Status.ARRIVED,
        Status.DELIVERED,
        Status.CANCELLED,
    )

    # Where the journey stops. Distinct from LOCKED_STATUSES, and the
    # difference is the whole reason both exist: a shipment in transit is
    # locked, in that nobody may change what is in it or where it is going,
    # and it is emphatically not finished - it still has to arrive and be
    # delivered. What is frozen is the description of the shipment; what
    # carries on is the shipment.
    TERMINAL_STATUSES = (Status.DELIVERED, Status.CANCELLED)

    # What "locked" actually protects. Not every column: staff still record
    # the arrival date of a shipment already at sea, and the invoice flow
    # still writes delivered_at. These are the facts that describe *what was
    # sent and where it went*, and those cannot change after it went.
    FROZEN_FIELDS = (
        "user",
        "delivery_address",
        "delivery_address_text",
        "description",
        "weight_kg",
        "value_eur",
    )

    # The stages in the order they happen, which is what makes "forwards" and
    # "backwards" mean something. Cancelled is not in it: calling a shipment
    # off is not progress along the journey, it is leaving the journey.
    #
    # Forward-only rather than a table of permitted pairs, because the office
    # legitimately skips stages — a parcel already at the counter is packed
    # and gone the same afternoon, and nobody should have to click through
    # `ready_for_shipping` to say so. What is refused is going back, which is
    # the move that would quietly rewrite what happened.
    STAGE_ORDER = (
        Status.QUOTED,
        Status.PAID,
        Status.PURCHASED,
        Status.READY_FOR_SHIPPING,
        Status.IN_TRANSIT,
        Status.ARRIVED,
        Status.DELIVERED,
    )

    # ---- where it is on the warehouse floor ------------------------------
    #
    # Separate from `status`, which is the customer's journey and drives the
    # lock, the invoice and the tracking page. These are the steps the floor
    # works through, which the customer never sees and which may be moved in
    # either direction - a box marked packed that turns out to be missing an
    # item goes back to processing, and that is a correction, not a rewrite of
    # anything the customer was told.
    class WarehouseStage(models.TextChoices):
        # The stored value predates the wording; "expected" is what it means.
        AWAITING_PICKUP = "awaiting_pickup", "Package expected"
        RECEIVED = "received", "Package received"
        AWAITING_MEASUREMENT = "awaiting_measurement", "Waiting for measurement"
        MEASURED = "measured", "Measured"
        AWAITING_PACKAGING = "awaiting_packaging", "Waiting for packaging"
        PACKED = "packed", "Packaged"
        READY = "ready", "Ready for shipping"
        SHIPPED = "shipped", "Shipped"

    # How long a shipment may sit in a stage before the board calls it
    # waiting too long. Shipped is absent: it has left, nothing is waiting.
    WAREHOUSE_STAGE_LIMITS = {
        WarehouseStage.AWAITING_PICKUP: timedelta(days=3),
        WarehouseStage.RECEIVED: timedelta(days=1),
        WarehouseStage.AWAITING_MEASUREMENT: timedelta(days=2),
        WarehouseStage.MEASURED: timedelta(days=2),
        WarehouseStage.AWAITING_PACKAGING: timedelta(days=2),
        WarehouseStage.PACKED: timedelta(days=2),
        WarehouseStage.READY: timedelta(days=5),
    }

    # The stages a warehouse worker may put a shipment in. Expected belongs to
    # the office (it is what an order is before goods arrive) and shipped to
    # dispatch; those, and every customer-facing status, are the office's and
    # the drivers'. Enforced in warehouse/operations.py, on the server.
    WAREHOUSE_WORKER_STAGES = (
        WarehouseStage.RECEIVED,
        WarehouseStage.AWAITING_MEASUREMENT,
        WarehouseStage.MEASURED,
        WarehouseStage.AWAITING_PACKAGING,
        WarehouseStage.PACKED,
        WarehouseStage.READY,
    )

    # One status line for the whole journey, read from `status` and
    # `warehouse_stage` together. Derived rather than stored, so the two
    # columns that own the facts cannot disagree with a third copy.
    class Workflow(models.TextChoices):
        ORDER_CREATED = "order_created", "Order created"
        PACKAGE_EXPECTED = "package_expected", "Package expected"
        PACKAGE_RECEIVED = "package_received", "Package received"
        WAITING_FOR_MEASUREMENT = "waiting_for_measurement", "Waiting for measurement"
        MEASURED = "measured", "Measured"
        WAITING_FOR_PACKAGING = "waiting_for_packaging", "Waiting for packaging"
        PACKAGED = "packaged", "Packaged"
        READY_FOR_SHIPPING = "ready_for_shipping", "Ready for shipping"
        SHIPPED = "shipped", "Shipped"
        IN_TRANSIT = "in_transit", "In transit"
        ARRIVED = "arrived", "Arrived at destination"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    _STAGE_WORKFLOW = {
        WarehouseStage.RECEIVED: Workflow.PACKAGE_RECEIVED,
        WarehouseStage.AWAITING_MEASUREMENT: Workflow.WAITING_FOR_MEASUREMENT,
        WarehouseStage.MEASURED: Workflow.MEASURED,
        WarehouseStage.AWAITING_PACKAGING: Workflow.WAITING_FOR_PACKAGING,
        WarehouseStage.PACKED: Workflow.PACKAGED,
        WarehouseStage.READY: Workflow.READY_FOR_SHIPPING,
        WarehouseStage.SHIPPED: Workflow.SHIPPED,
    }

    objects = PackageQuerySet.as_manager()

    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="packages",
    )

    warehouse_stage = models.CharField(
        max_length=20,
        choices=WarehouseStage.choices,
        default=WarehouseStage.AWAITING_PICKUP,
    )
    # When it entered the stage it is in, which is what "waiting too long" is
    # measured from.
    warehouse_stage_at = models.DateTimeField(default=timezone.now)
    # Where on the floor it is: a rack, bay or shelf code such as "B-04".
    # Free text, because every warehouse labels its racks its own way.
    warehouse_location = models.CharField(max_length=40, blank=True)
    # The first time it was received, kept when the stage moves on, so "today's
    # packages" still counts a box that was received and packed the same day.
    received_at = models.DateTimeField(null=True, blank=True)
    # When the office sent it to the warehouse floor before it was paid for:
    # a booking given its shipping number (bookings/shipments.py
    # send_to_warehouse). Until then an unpaid shipment ("Quote sent") is not
    # on the floor's list; once paid it is anyway. Null when never sent.
    sent_to_warehouse_at = models.DateTimeField(null=True, blank=True)

    # A problem is a flag beside the stage rather than a stage of its own: a
    # damaged box is still packed, and clearing the problem must not have to
    # guess where it was.
    problem_note = models.CharField(max_length=500, blank=True)
    problem_reported_at = models.DateTimeField(null=True, blank=True)
    problem_reported_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    # SET_NULL, not PROTECT: PROTECT would make deleting a customer impossible,
    # because that cascade reaches their addresses and stops dead here — which
    # would leave no way to honour a request for erasure.
    delivery_address = models.ForeignKey(
        Address,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="packages",
    )

    # Where it was actually sent, frozen at the time of shipping. A shipment
    # record must not silently change when the customer later edits or removes
    # that address — this is the copy that survives.
    delivery_address_text = models.TextField(
        blank=True,
        help_text="Snapshot of the delivery address as it was when shipped.",
    )

    tracking_number = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)

    class Freight(models.TextChoices):
        SEA = "sea", "Sea freight"
        AIR = "air", "Air freight"

    # How it travels. Blank until somebody decides: set by the office, or
    # copied from the first intake sheet that names one.
    freight = models.CharField(max_length=10, choices=Freight.choices, blank=True)

    class Handover(models.TextChoices):
        DELIVERY = "delivery", "Delivered to the customer"
        PICKUP = "pickup", "Picked up by the customer"

    # How the customer gets it at the end: our agent delivers it, or the
    # customer comes and collects it. Set by the office. Changes the last step
    # of the customer's timeline: "Delivered" or "Picked up" (accounts/public.py).
    # Either way the shipment ends in status DELIVERED - "handed over".
    handover = models.CharField(
        max_length=10, choices=Handover.choices, default=Handover.DELIVERY
    )
    # When the customer made their choice on the website. They get one go:
    # once this is set the website refuses a second choice, and a change has
    # to be asked for by e-mail - the office then changes `handover` itself
    # (staff can always change it). Null = the customer has not chosen yet.
    handover_chosen_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.QUOTED,
    )

    weight_kg = models.DecimalField(
        max_digits=8,
        decimal_places=3,
        null=True,
        blank=True,
    )
    # Decimal, never float: floats cannot represent money exactly.
    value_eur = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )

    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    # What the customer is told to expect, set by staff when the shipment is
    # booked. A real field rather than a guess derived from the status: an
    # arrival date invented by arithmetic is a promise nobody made.
    estimated_arrival = models.DateField(
        null=True,
        blank=True,
        help_text="Shown on the public tracking page. Leave empty if not known yet.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            # The two lookups the customer-facing pages will make.
            models.Index(fields=["user", "status"]),
            models.Index(fields=["tracking_number"]),
            # The warehouse board: counts per stage, and what has sat too long.
            models.Index(
                fields=["warehouse_stage", "warehouse_stage_at"],
                name="accounts_pa_wh_stage_idx",
            ),
        ]

    def __str__(self):
        return f"{self.tracking_number} ({self.get_status_display()})"

    @property
    def workflow_status(self):
        """Where the shipment is in the one combined workflow."""
        W = self.Workflow
        if self.status == self.Status.CANCELLED:
            return W.CANCELLED
        if self.status == self.Status.DELIVERED:
            return W.DELIVERED
        if self.status == self.Status.ARRIVED:
            return W.ARRIVED
        if self.status == self.Status.IN_TRANSIT:
            return W.IN_TRANSIT
        if self.warehouse_stage in self._STAGE_WORKFLOW:
            return self._STAGE_WORKFLOW[self.warehouse_stage]
        return W.ORDER_CREATED if self.status == self.Status.QUOTED else W.PACKAGE_EXPECTED

    def get_workflow_status_display(self):
        return self.Workflow(self.workflow_status).label

    @property
    def package_number(self):
        """The internal package number printed on the floor's screens."""
        return f"PKG-{self.pk:06d}" if self.pk else ""

    @property
    def overdue_since(self):
        """When this shipment started waiting too long, or None if it is not."""
        limit = self.WAREHOUSE_STAGE_LIMITS.get(self.warehouse_stage)
        if limit is None or self.warehouse_stage_at is None:
            return None
        due = self.warehouse_stage_at + limit
        return due if due <= timezone.now() else None

    @property
    def progress(self):
        """How far along the journey is, 0-100, for a progress bar.

        A reading of the status rather than a measurement — the status is the
        only thing actually known — so the numbers are the even spacing of the
        stages, not a claim about distance covered or time elapsed.
        """
        return {
            self.Status.QUOTED: 5,
            self.Status.PAID: 20,
            self.Status.PURCHASED: 35,
            self.Status.READY_FOR_SHIPPING: 45,
            self.Status.IN_TRANSIT: 60,
            self.Status.ARRIVED: 80,
            self.Status.DELIVERED: 100,
            # Nothing is under way, so nothing is part-done.
            self.Status.CANCELLED: 0,
        }.get(self.status, 0)

    @property
    def destination_label(self):
        """Where it is going, at country level and no finer.

        The public tracking page shows this. The street address is on the row
        as well, and deliberately never leaves the server for an anonymous
        caller — a tracking number is not a credential.
        """
        if self.delivery_address_id and self.delivery_address:
            return self.delivery_address.get_country_display()

        # The address the package was actually sent to is frozen as text; its
        # last line is the country. Used when the address row itself is gone,
        # which happens when the customer erases their account.
        lines = [line for line in self.delivery_address_text.splitlines() if line.strip()]
        return lines[-1].strip() if lines else ""

    # ---- the lock -------------------------------------------------------

    @property
    def locked(self):
        """True once the shipment has gone beyond anybody's power to change.

        In transit, arrived, delivered or cancelled. The crate is on the water
        or the parcel is in somebody's hands; the row describes a thing that
        has already happened, and a record of what happened is not a form.
        """
        return self.status in self.LOCKED_STATUSES

    @property
    def locked_for_customer(self):
        """True once the customer may no longer add to this shipment.

        Wider than `locked` by one stage: a shipment that is packed and
        waiting is closed to the customer while the office can still open the
        crate for a late parcel. That is the "unless an administrator allows
        it" case, and this is the property the customer-facing API reads.
        """
        return self.locked or self.status in self.STAFF_ONLY_STATUSES

    @property
    def lock_reason(self):
        """Why it cannot be changed, in the customer's terms, or "" if it can.

        Lives on the model rather than in a serializer so that the API, the
        admin and any channel added later all give the same answer to the same
        question. The React app has its own translated copy for the screen;
        this is what a caller reading the API is told.
        """
        if self.status in self.LOCKED_STATUSES:
            if self.status == self.Status.CANCELLED:
                return "This shipment was cancelled and can no longer be changed."
            return (
                "This shipment has already been sent and can no longer be "
                "changed. Anything bought now will travel as a separate "
                "shipment with its own tracking number."
            )
        if self.status in self.STAFF_ONLY_STATUSES:
            return (
                "This shipment is packed and ready to leave, so it can no "
                "longer be added to online. Ask the office if something has "
                "to go with it."
            )
        return ""

    def can_change(self, *, by_staff=False):
        """Whether this shipment may still be altered by that kind of caller.

        The one question every write path asks, answered in one place. Staff
        get the extra stage; nobody gets a shipment that has already left.
        """
        if self.locked:
            return False
        return True if by_staff else not self.locked_for_customer

    def check_can_change(self, *, by_staff=False):
        """can_change(), raising instead of returning.

        For the call sites that would otherwise each write their own
        `if not ...: raise`. ShipmentLocked becomes a 409 in both views.py.
        """
        if not self.can_change(by_staff=by_staff):
            raise ShipmentLocked(self.lock_reason)

    def check_transition(self, to_status):
        """Whether this shipment may move from where it is to `to_status`.

        Forwards along STAGE_ORDER, or off it to cancelled from a stage that
        has not left yet. Two things are refused: going backwards, which would
        rewrite what happened, and moving at all out of a terminal stage,
        which is what makes "delivered" and "cancelled" permanent rather than
        merely discouraged.

        A locked shipment still moves. In transit is locked and unfinished at
        the same time - nobody may change what is in the crate, and the crate
        still has to arrive.
        """
        current = self.status
        if to_status == current:
            return

        if current in self.TERMINAL_STATUSES:
            raise InvalidShipmentTransition(
                f"This shipment is {self.get_status_display().lower()} and "
                "cannot be moved to another status."
            )

        if to_status == self.Status.CANCELLED:
            # Only before it leaves. After that there is a crate on a boat
            # somewhere that cancelling a database row does not bring back.
            if current in self.LOCKED_STATUSES:
                raise InvalidShipmentTransition(
                    "This shipment has already left and cannot be cancelled. "
                    "Handle it as a return once it arrives."
                )
            return

        order = self.STAGE_ORDER
        if to_status not in order or current not in order:
            raise InvalidShipmentTransition(
                f"{to_status} is not a stage a shipment can move to."
            )
        if order.index(to_status) < order.index(current):
            raise InvalidShipmentTransition(
                "A shipment cannot go back a stage. Correct the record in the "
                "admin if it was moved on by mistake."
            )

    @classmethod
    def from_db(cls, db, field_names, values):
        """Remember what the row said when it was read.

        save() has to know whether a protected column is *changing*, and the
        only honest source for the old value is the row that was loaded.
        Re-fetching would cost a query per save; this costs a dict.
        """
        instance = super().from_db(db, field_names, values)
        instance._loaded = dict(zip(field_names, values))
        return instance

    def changed_fields(self):
        """Which columns differ from what was loaded, as a set of names.

        Empty for a row that was never loaded from the database - a new one,
        where every column is being written for the first time and so nothing
        is being changed.
        """
        loaded = getattr(self, "_loaded", None)
        if loaded is None:
            return set()
        return {
            name for name, was in loaded.items() if getattr(self, name, None) != was
        }

    def save(self, *args, force_unlock=False, **kwargs):
        """Freeze the delivery address, then refuse a change that is too late.

        The check is here, on the model, and not only in the serializers,
        because a serializer guards one door. The admin, a management command,
        the shell and whatever view gets written next year all come through
        save(), and the point of the rule is that it cannot be stepped around
        by sending the request somewhere else. The matching guard for a bulk
        update() is on PackageQuerySet above.

        `force_unlock=True` is the deliberate exception, for a data repair
        that means to rewrite a record and says so at the call site.
        """
        if not self.delivery_address_text and self.delivery_address_id:
            address = self.delivery_address
            self.delivery_address_text = (
                f"{address.street} {address.house_number}\n"
                f"{address.postal_code} {address.city}\n"
                f"{address.get_country_display()}"
            ).strip()

        # Only a stored row can be locked. Creating a shipment that is already
        # delivered is an import, not a modification; refusing it would break
        # every fixture and backfill and protect nothing.
        if not force_unlock and not self._state.adding and hasattr(self, "_loaded"):
            changed = self.changed_fields()
            stored_status = self._loaded.get("status")

            if "status" in changed:
                # Asked of the stored status, not of self.status - which is
                # already the new one by the time save() runs.
                self.__class__(status=stored_status).check_transition(self.status)

            frozen = set(self.FROZEN_FIELDS) | {f"{f}_id" for f in self.FROZEN_FIELDS}
            if stored_status in self.LOCKED_STATUSES and (changed & frozen):
                raise ShipmentLocked(self.lock_reason)

        super().save(*args, **kwargs)

        # The row is its own baseline again, so a second save() in the same
        # request does not re-report the first one's changes as new ones.
        # Deferred columns are skipped rather than read: this runs on every
        # save, and reading one would fire a query to fetch a value only in
        # order to record that it has not changed.
        deferred = self.get_deferred_fields()
        self._loaded = {
            field.attname: getattr(self, field.attname)
            for field in self._meta.concrete_fields
            if field.attname not in deferred
        }


def package_document_path(instance, filename):
    """Where a customer's own upload is written, under MEDIA_ROOT.

    Foldered by year and by shipment, so the files belonging to one parcel sit
    together and the directory does not grow into one flat listing of every
    receipt ever sent. Named by Django's own storage, which suffixes a name
    that is already taken rather than overwriting - two customers who both
    upload "receipt.pdf" must not end up sharing one file.

    The customer's own filename never reaches this path. It is used for the
    extension only, and only after being checked; see PackageDocument.EXTENSIONS.
    """
    # A document need not belong to a shipment — somebody can send in the
    # receipt for a television before the parcel carrying it exists — so the
    # folder falls back to the customer when there is no tracking number.
    folder = (
        instance.package.tracking_number
        if instance.package_id
        else f"customer-{instance.customer_id}"
    )
    return f"documents/{timezone.localtime():%Y}/{folder}/{filename}"


class PackageDocument(models.Model):
    """A file the customer attached to their own shipment.

    The receipt for the television they bought, the invoice from the shop, the
    customs form - the paperwork that belongs to a parcel and that the office
    needs to see but has no way to produce itself. It goes the opposite way to
    invoicing.Invoice, which is a document the business sends out; this is one
    the customer sends in.

    The file is never reachable through MEDIA_URL. A receipt carries a name, an
    address, a card's last digits and what somebody bought, and a MEDIA_URL
    link to one is a bearer token made of a guessable path. It is served by
    accounts.views.PackageDocumentViewSet.file, which knows who is asking.
    """

    class Kind(models.TextChoices):
        RECEIPT = "receipt", "Receipt"
        INVOICE = "invoice", "Shop invoice"
        CUSTOMS = "customs", "Customs form"
        OTHER = "other", "Other"

    # What may be uploaded, as extension -> the bytes a real one starts with.
    #
    # The extension and the browser's content type are both supplied by the
    # caller and neither is evidence of anything. The signature is the check
    # that actually holds: a .exe renamed .pdf fails it, and so does an HTML
    # page saved as .jpg. JPEG's marker is two bytes because the third varies
    # by encoder, which is as far as a signature check can honestly go.
    SIGNATURES = {
        ".pdf": (b"%PDF-",),
        ".png": (b"\x89PNG\r\n\x1a\n",),
        ".jpg": (b"\xff\xd8\xff",),
        ".jpeg": (b"\xff\xd8\xff",),
    }

    # The type each accepted extension is served as. Fixed here rather than
    # taken from the upload: the browser's Content-Type claim is whatever the
    # sender chose, and serving that back would let a file that passed the
    # signature check be labelled text/html.
    CONTENT_TYPES = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }

    # 10 MB. A phone photograph of a receipt is a megabyte or two; this leaves
    # room for a scan without letting the media directory fill up with video
    # somebody renamed.
    MAX_BYTES = 10 * 1024 * 1024

    # Whose paperwork this is. Required, and the column every read is scoped
    # by: a document does not need a shipment, but it always has an owner, and
    # without one there would be no way to answer "may this person see this".
    #
    # CASCADE, because erasing an account should take the receipts with it.
    # They are the customer's own documents rather than a record of what the
    # business did, which is what invoices are and why those are kept.
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="documents",
    )

    # Which shipment it belongs to, when it belongs to one.
    #
    # Optional on purpose. The receipt exists before the parcel does: somebody
    # buys a television, has the till receipt in their hand, and the shipment
    # is booked days later. Requiring the link would mean the only people who
    # could send a receipt in are the ones who no longer urgently need to.
    # Staff can see an unattached document on the customer and attach it later.
    package = models.ForeignKey(
        "accounts.Package",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documents",
    )

    # Who sent it in. SET_NULL rather than CASCADE: erasing an account must
    # not delete the paperwork for a shipment that still exists, because the
    # office may still need to prove what was declared. The row keeps the
    # file and loses the person, which is what User.anonymise() does
    # everywhere else.
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_documents",
    )

    kind = models.CharField(
        max_length=20,
        choices=Kind.choices,
        default=Kind.RECEIPT,
    )

    file = models.FileField(upload_to=package_document_path)

    # What the customer called it, kept so their own list shows the name they
    # recognise rather than the storage path. Never used to build that path.
    original_name = models.CharField(max_length=255, blank=True)

    # Recorded at upload rather than sniffed on the way out, so serving a file
    # is a read and not an inspection.
    content_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)

    # The customer's own words about what this is: "receipt from MediaMarkt".
    note = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            # Everything attached to a parcel, and everything belonging to a
            # customer — the two queries the profile page and the dashboard
            # make between them.
            models.Index(fields=["package", "-created_at"]),
            models.Index(fields=["customer", "-created_at"]),
        ]

    def __str__(self):
        where = (
            self.package.tracking_number
            if self.package_id
            else f"{self.customer} (no shipment)"
        )
        return f"{self.get_kind_display()} for {where}"

    @property
    def served_content_type(self):
        """The Content-Type to download this document with.

        From the stored file's extension (one of SIGNATURES, checked at
        upload), never from the content_type column: rows written before this
        existed hold whatever the uploader's browser claimed.
        """
        import os

        extension = os.path.splitext(self.file.name or "")[1].lower()
        return self.CONTENT_TYPES.get(extension, "application/octet-stream")

    @property
    def filename(self):
        """The name to hand back on download.

        The customer's own name when there is one, because that is what they
        will recognise in their downloads folder - but only its basename, and
        only its own extension, so a name that arrived carrying a path cannot
        put one in a Content-Disposition header.
        """
        import os
        import re

        name = os.path.basename(self.original_name or "")
        # Anything a filesystem or a header would read as structure comes out.
        name = re.sub(r'[^A-Za-z0-9 ._-]', "", name).strip()

        if name and os.path.splitext(name)[1].lower() in self.SIGNATURES:
            return name

        extension = os.path.splitext(self.file.name)[1].lower() or ".bin"
        stem = (
            self.package.tracking_number
            if self.package_id
            else f"document-{self.pk}"
        )
        return f"{stem}-{self.kind}{extension}"


class PackageEvent(models.Model):
    """One thing that happened to an order, kept for good.

    The system had no memory. Package carries a status and two timestamps —
    shipped_at and delivered_at — which is the current state plus two moments
    out of seven, and Invoice.submit_for_review() deliberately erases
    reviewed_by, reviewed_at and rejection_reason every time a corrected
    invoice comes back round. An invoice rejected three times and then approved
    showed the approval and nothing else. None of that was recoverable, because
    none of it was ever written down.

    So this is the write-down. Append-only, one row per thing that happened,
    keyed to the order rather than to the package or the invoice separately:
    Invoice is OneToOne with Package, so an order's whole history — shipping
    and billing both — is one query in one chronological list, which is exactly
    what a timeline is.

    Two kinds of question it answers, from the same rows:

      * What happened to my order, and when.
      * Who approved that invoice, and what did the reviewer who rejected it
        the first time actually say.

    Rows are never updated. save() refuses it rather than trusting everyone to
    remember, because a log that can be edited answers the second question with
    whatever the last editor wanted it to say.
    """

    class Kind(models.TextChoices):
        # Written by staff.views.PackageViewSet.perform_update, the one place
        # a package's status changes.
        STATUS_CHANGED = "status_changed", "Shipment status changed"

        # Written by the warehouse shipment API. Staff-only history: nothing
        # customer-facing reads these rows.
        WAREHOUSE_STAGE_CHANGED = "warehouse_stage_changed", "Warehouse stage changed"
        PROBLEM_REPORTED = "problem_reported", "Problem reported"
        PROBLEM_RESOLVED = "problem_resolved", "Problem resolved"

        # Written by invoicing. Kept as distinct kinds rather than one
        # "invoice_changed" with the status in context, because a timeline
        # renders them with different words and a reader filtering for
        # rejections should not have to know the shape of a JSON blob.
        INVOICE_RAISED = "invoice_raised", "Invoice raised"
        INVOICE_RESUBMITTED = "invoice_resubmitted", "Invoice resubmitted"
        INVOICE_APPROVED = "invoice_approved", "Invoice approved"
        INVOICE_REJECTED = "invoice_rejected", "Invoice rejected"
        INVOICE_SENT = "invoice_sent", "Invoice sent"

    # The verdicts. Split out because the constraint below needs them and
    # because "show me the review history" is a query somebody will want.
    REVIEW_KINDS = (Kind.INVOICE_APPROVED, Kind.INVOICE_REJECTED)

    # CASCADE, matching Invoice.package: the history of an order that no longer
    # exists is not a record of anything. The erasure path customers actually
    # take is User.anonymise(), which keeps every package and so keeps this.
    package = models.ForeignKey(
        Package,
        on_delete=models.CASCADE,
        related_name="events",
    )

    kind = models.CharField(max_length=32, choices=Kind.choices)

    # When it happened, which is not always when the row was written: the
    # backfill in migration 0008 states times it read from shipped_at and
    # reviewed_at, and those are years older than the row. Hence a default
    # rather than auto_now_add — the caller is allowed to know better.
    at = models.DateTimeField(default=timezone.now)

    # When we found out. Separate from `at` so a backfilled row is honest about
    # being backfilled, and so two events claiming the same moment can still be
    # put in the order they were recorded.
    recorded_at = models.DateTimeField(auto_now_add=True)

    # PROTECT for the same reason as Invoice.reviewed_by: this is the audit
    # trail, and a staff account that has approved things cannot be deleted out
    # from under the record of it having done so. Null for events with no
    # person behind them — the render task marking an invoice sent is the
    # system finishing a job, not somebody deciding something.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="package_events",
    )

    # The facts the wording is built from: from_status and to_status for a
    # shipment move, reason for a rejection, invoice_number for the billing
    # ones. Denormalised on the same reasoning as Notification.context — the
    # line has to still read correctly after the invoice it describes has been
    # corrected out from under it.
    context = models.JSONField(default=dict, blank=True)

    class Meta:
        # Chronological, with the primary key breaking ties: a backfill can
        # write several events carrying the same timestamp, and a timeline that
        # reorders itself between two requests looks broken.
        ordering = ["at", "id"]
        indexes = [
            # The timeline query, and the only one that matters.
            models.Index(fields=["package", "at"]),
            # "Every rejection last month", for the review log.
            models.Index(fields=["kind", "-at"]),
        ]
        constraints = [
            # A verdict is somebody's. An approval with no approver is the
            # exact hole this table was built to close, so it is closed in the
            # database and not only in the helper that writes the rows.
            models.CheckConstraint(
                condition=(
                    ~Q(kind__in=["invoice_approved", "invoice_rejected"])
                    | Q(actor__isnull=False)
                ),
                name="package_event_verdict_has_an_actor",
            ),
        ]

    def __str__(self):
        return f"{self.package.tracking_number}: {self.get_kind_display()}"

    def save(self, *args, **kwargs):
        """Write once.

        Refused rather than merely discouraged. The whole value of this table
        is that a row means what it said when it was written; a log that can be
        edited after the fact proves nothing about who did what.

        Deleting is left alone: the CASCADE from Package has to work, and a
        history without its order is not a record anybody can read anyway.
        """
        if self.pk is not None and not self._state.adding:
            raise ValueError(
                "PackageEvent rows are append-only and cannot be changed. "
                "Record a new event instead."
            )
        return super().save(*args, **kwargs)


def delivery_photo_path(instance, filename):
    """Stored per shipment. The uploader's own filename is never used."""
    return f"deliveries/{timezone.localtime():%Y/%m}/{instance.package.tracking_number}/{filename}"


class DeliveryConfirmation(models.Model):
    """Proof that a driver handed a shipment over: who took it, and a photo.

    One per package, written once, by accounts/driver.py at the moment the
    driver marks the shipment delivered. The shipment's own status and
    delivered_at are changed in the same transaction.
    """

    package = models.OneToOneField(
        Package, on_delete=models.CASCADE, related_name="delivery_confirmation"
    )
    # PROTECT: the record of who delivered must outlive a deleted account.
    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="deliveries"
    )
    recipient_name = models.CharField(max_length=150)
    note = models.CharField(max_length=500, blank=True)
    photo = models.FileField(upload_to=delivery_photo_path, blank=True)
    photo_content_type = models.CharField(max_length=20, blank=True)
    delivered_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-delivered_at"]

    def __str__(self):
        return f"{self.package.tracking_number} delivered to {self.recipient_name}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("A delivery confirmation cannot be changed.")
        return super().save(*args, **kwargs)


class WarehouseSignInCode(models.Model):
    """A short code an admin has e-mailed to a warehouse worker so they can sign in.

    The floor is busy and the phones are shared and slow to type a long
    password into, so an admin can send a worker a four-digit code instead.
    accounts/signin_codes.py is where codes are issued and spent; this is only
    the record of them.

    Four digits is ten thousand possibilities, which is a short secret on its
    own. Everything that makes it acceptable is about limiting what a guess can
    do, and lives in signin_codes.py: a code is single-use, lasts minutes, is
    refused after a handful of wrong guesses, belongs to one warehouse account,
    and is never shown to the admin who sent it.

    Only a digest is stored, so a database dump or the Django admin does not
    contain a code somebody could still use. That is a courtesy rather than a
    defence - with ten thousand possibilities a digest can be brute-forced
    offline in an instant - which is why the short expiry matters more.

    Rows are kept after use. Who sent a code, to whom, and when it was spent is
    the audit trail for an access grant.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sign_in_codes",
    )
    # An HMAC-SHA256 hex digest, bound to the user so two workers who happen to
    # hold the same code do not share a digest. See signin_codes._digest.
    code_hash = models.CharField(max_length=64)

    # SET_NULL, unlike the invoice audit columns: a code is throwaway and lives
    # for minutes, so deleting an admin account must not be blocked by one.
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    # Set once, by a conditional UPDATE, by whoever spends it first.
    used_at = models.DateTimeField(null=True, blank=True)

    # Guesses made against this code, right or wrong. Counted before the code
    # is compared - see signin_codes.redeem_code for why.
    attempts = models.PositiveSmallIntegerField(default=0)

    # Shown to the admin who sent it, because the site had no way to e-mail
    # it (signin_codes.code_goes_on_screen). That admin could have used it
    # themselves, so a sign-in with it says less about who was really there.
    shown_on_screen = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self):
        return f"Sign-in code for {self.user_id} ({self.created_at:%Y-%m-%d %H:%M})"


class FloorDevice(models.Model):
    """A phone or scanner the warehouse floor shares, registered by an admin.

    Only a registered device may sign a worker in with a PIN, or show the list
    of who works here to tap a name from. That is what keeps a four-digit PIN
    from being a password anybody on the internet can guess at: it is useless
    without one of these, and these live in the warehouse.

    The device holds a long random token in an HttpOnly cookie, set when an
    admin registers it from the device itself. Only a SHA-256 digest is kept
    here - the token has 256 bits, so unlike a PIN the digest cannot be turned
    back into it - and a device is revoked rather than deleted, so the audit
    trail keeps pointing at something. See accounts/floor.py.
    """

    name = models.CharField(max_length=80)
    token_hash = models.CharField(max_length=64, unique=True)

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    # Touched when the device shows the list or signs somebody in, so an admin
    # can tell a device in daily use from one in a drawer.
    last_seen_at = models.DateTimeField(null=True, blank=True)

    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class FloorLocation(models.Model):
    """An area of the warehouse a floor device can be allowed into.

    "Packing area", "Intake desk", "Damage bay": a place, plus the parts of the
    warehouse app that are worked there (`sections`, keys of
    warehouse.models.WarehouseAccess.SECTIONS). A floor device is granted
    locations (FloorDeviceAccess), and on that device only the sections of its
    granted locations can be used - see accounts/floor.py, device_allows().

    Deny by default, but only once the feature is in use: while no location
    exists at all, floor devices work as they always did. From the first
    location on, a device with no grant cannot use any section, so an admin
    decides device by device what each one is for.

    Scanning, the package page and moving a package along belong to no
    section and stay available on every device - without them the floor
    cannot work at all, which is the same rule WarehouseAccess follows.
    """

    name = models.CharField(max_length=80, unique=True)
    description = models.CharField(max_length=200, blank=True)
    # A list of WarehouseAccess.SECTIONS keys. Validated by the staff API.
    sections = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class FloorDeviceAccess(models.Model):
    """One grant: this floor device may be used in this location.

    No row means no access. Revoking deletes the row; the history of who
    granted and revoked what lives in FloorEvent, so it survives the row.
    """

    device = models.ForeignKey(FloorDevice, on_delete=models.CASCADE, related_name="access_grants")
    location = models.ForeignKey(
        FloorLocation, on_delete=models.CASCADE, related_name="device_grants"
    )
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    granted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["device", "location"], name="unique_floor_device_location")
        ]

    def __str__(self):
        return f"{self.device} in {self.location}"


class WarehousePin(models.Model):
    """A warehouse worker's four-digit PIN, for signing in on a floor device.

    Set by the worker themselves, straight after signing in with a code an
    admin e-mailed them: the e-mail is what proves who they are, the PIN is
    what makes the next hundred handovers take seconds. Setting it again the
    same way is how a forgotten or locked PIN is replaced.

    Stored with Django's password hasher. Ten thousand possibilities can be
    tried offline whatever the hasher, so what protects a PIN is in
    accounts/floor.py: it only works on a registered device, and five wrong
    tries in a row lock it.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="warehouse_pin",
    )
    pin_hash = models.CharField(max_length=128)
    set_at = models.DateTimeField()

    # Wrong tries since the last right one. Counted before the PIN is
    # compared, in one conditional UPDATE - see floor.sign_in_with_pin.
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    # Set by the try that used up the last attempt. Cleared only by setting a
    # new PIN, after an e-mailed code, or by an admin resetting it.
    locked_at = models.DateTimeField(null=True, blank=True)
    # True for a PIN a manager generated (floor.issue_pin): somebody else has
    # seen it, so the worker must choose their own straight after signing in
    # with it, and the warehouse stays closed until they do
    # (staff.permissions.IsWarehouseOrStaff). Cleared when they set their own.
    must_change = models.BooleanField(default=False)

    def __str__(self):
        return f"PIN for {self.user_id}"


class AuditRecordImmutable(Exception):
    """Somebody tried to change or delete a row of the audit trail."""


class FloorEventQuerySet(models.QuerySet):
    """Refuses bulk update() and delete(): they skip FloorEvent.save/delete.

    (A user or device being deleted still sets their columns to empty: Django
    does that with its own SQL, not through this queryset, so the row - what
    happened, and when - stays.)
    """

    def update(self, **kwargs):
        raise AuditRecordImmutable("Floor audit records cannot be changed.")

    def delete(self):
        raise AuditRecordImmutable("Floor audit records cannot be deleted.")

    def bulk_update(self, *args, **kwargs):
        raise AuditRecordImmutable("Floor audit records cannot be changed.")


class FloorEvent(models.Model):
    """Who signed in on which floor device, what happened to their PIN, and
    who opened, switched off or changed a warehouse account.

    The audit trail an admin reads when a scan or a damage report is disputed:
    the system records the signed-in worker against everything they do, so
    which worker was signed in on which device, and when, is the question.
    Never holds a PIN, right or wrong.

    APPEND-ONLY: a row is written once and never changed or deleted - not by
    the code (save/delete below refuse), not in bulk (FloorEventQuerySet),
    not in Django's admin (FloorEventAdmin). An audit trail somebody can tidy
    up afterwards proves nothing.
    """

    class Kind(models.TextChoices):
        PIN_SIGN_IN = "pin_sign_in", "Signed in with PIN"
        PIN_UNLOCK = "pin_unlock", "Opened the warehouse with e-mail and PIN"
        CODE_SIGN_IN = "code_sign_in", "Signed in with e-mailed code"
        WRONG_PIN = "wrong_pin", "Wrong PIN"
        PIN_LOCKED = "pin_locked", "PIN locked after too many wrong tries"
        PIN_SET = "pin_set", "PIN set"
        PIN_RESET = "pin_reset", "PIN reset by an admin"
        # A manager generated a new PIN to hand over (floor.issue_pin).
        PIN_ISSUED = "pin_issued", "PIN generated by a manager"
        # /warehouse/login on a computer that is not a registered device.
        EMAIL_PIN_SIGN_IN = "email_pin_sign_in", "Signed in with e-mail and PIN"
        SIGN_OUT = "sign_out", "Signed out"
        # A manager or admin switching a floor account off or on again.
        ACCOUNT_DEACTIVATED = "account_deactivated", "Account switched off"
        ACCOUNT_ACTIVATED = "account_activated", "Account switched on"
        ACCESS_GRANTED = "access_granted", "Location access granted"
        ACCESS_REVOKED = "access_revoked", "Location access revoked"
        # Account management (staff CustomerViewSet). `actor` is the admin or
        # manager who did it; `details` says which role.
        ACCOUNT_CREATED = "account_created", "Account created"
        ROLE_CHANGED = "role_changed", "Role changed"
        SESSIONS_REVOKED = "sessions_revoked", "Signed out everywhere"

    objects = FloorEventQuerySet.as_manager()

    kind = models.CharField(max_length=20, choices=Kind.choices)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="floor_events",
    )
    # Null for what did not happen on a floor device: a PIN set from the
    # worker's own phone, a reset from the office.
    device = models.ForeignKey(
        FloorDevice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )
    # The admin, for a reset or a location grant/revoke.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    # The location, for a grant or revoke. The name is copied too, so the
    # record still reads correctly after the location is renamed or deleted.
    location = models.ForeignKey(
        FloorLocation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    location_name = models.CharField(max_length=80, blank=True)
    # Extra facts for some kinds, as before/after pairs the activity log
    # shows ("Role: warehouse -> manager"): for a role change
    # {"from_role": "warehouse", "to_role": "manager"}, for a new account
    # {"role": "warehouse"}. Never a PIN or a password.
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at"]),
            # The per-device count of wrong PINs - see floor.device_is_cooling_off.
            models.Index(fields=["device", "kind", "created_at"]),
        ]

    def __str__(self):
        return f"{self.get_kind_display()} ({self.created_at:%Y-%m-%d %H:%M})"

    def save(self, *args, **kwargs):
        # Only the first save (the INSERT). Any later one would be an edit.
        if not self._state.adding:
            raise AuditRecordImmutable("Floor audit records cannot be changed.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise AuditRecordImmutable("Floor audit records cannot be deleted.")


class SiteSettings(models.Model):
    """Switches for the public website, set by an admin in the Django admin.

    There is only ever one row (pk=1): read it with SiteSettings.load().
    """

    show_stats_band = models.BooleanField(
        "show statistics band on the home page",
        default=False,
        help_text="The band with packages delivered, destinations and customers. "
        "Off: visitors do not see it.",
    )
    show_calculator = models.BooleanField(
        "show the shipping calculator page",
        default=True,
        help_text="The Calculator page and its links in the menu and footer. "
        "Off: visitors do not see it; staff can still open /calculator.",
    )

    # ---- the company, as printed on every invoice -----------------------
    #
    # Kept here rather than written into the PDF code so a new IBAN or phone
    # number is a change in the admin, and every invoice drawn afterwards
    # carries it. Invoices already sent keep the details they were drawn with.

    company_name = models.CharField(max_length=100, default="Pay Less Shop More")
    company_street = models.CharField(max_length=100, default="Hertzstraat 10")
    company_postcode_city = models.CharField(
        max_length=100, default="2652 XX Berkel en Rodenrijs"
    )
    company_kvk = models.CharField("KVK number", max_length=20, default="9322289")
    company_vat = models.CharField("BTW number", max_length=20, default="NL866317843B01")
    company_iban = models.CharField("IBAN", max_length=34, default="NL79INGB0115158162")
    company_email = models.EmailField(default="info@paylessshopmore.com")
    company_website = models.CharField(max_length=100, default="www.paylessshopmore.com")
    company_phone = models.CharField(max_length=30, blank=True, default="010 310 5317")

    class Meta:
        verbose_name = "site settings"
        verbose_name_plural = "site settings"

    def __str__(self):
        return "Site settings"

    def save(self, *args, **kwargs):
        # Always the same row, so there can never be two sets of settings.
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        """The settings, created with the defaults the first time they are read."""
        settings_row, _ = cls.objects.get_or_create(pk=1)
        return settings_row


# ---- Two-factor sign-in (accounts/twofactor.py explains the whole feature) ----


class TwoFactorPolicy(models.Model):
    """The admin's choice of how strict two-factor sign-in is. One row only.

    Changed on the dashboard's Security page. When there is no row yet (a
    fresh database, local development) the mode is DISABLED, so nobody is
    ever locked out of a site that has not decided yet.
    """

    class Mode(models.TextChoices):
        # In order from least to most strict; twofactor.STRICTNESS relies on it.
        DISABLED = "disabled", "Disabled"
        OPTIONAL = "optional", "Optional"
        REQUIRED_ADMINS = "required_admins", "Required for administrators and warehouse managers"
        REQUIRED_ALL = "required_all", "Required for everyone"

    mode = models.CharField(max_length=20, choices=Mode.choices, default=Mode.DISABLED)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        verbose_name = "two-factor policy"
        verbose_name_plural = "two-factor policy"

    def __str__(self):
        return f"Two-factor: {self.get_mode_display()}"

    def save(self, *args, **kwargs):
        # Always the same row, like SiteSettings.
        self.pk = 1
        super().save(*args, **kwargs)


class TwoFactorDevice(models.Model):
    """A person's authenticator app.

    The app on their phone and this row share one secret; both turn
    "secret + the current 30-second slot" into the same 6-digit code.

    `secret_encrypted` is the secret ENCRYPTED with TWO_FACTOR_ENCRYPTION_KEYS
    (accounts/twofactor_crypto.py), so a copy of the database alone does not
    give anybody the codes. `confirmed_at` stays empty until the person has
    typed one correct code during setup - proof the app was set up right.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="two_factor_device"
    )
    secret_encrypted = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    # The last 30-second slot a code was accepted for. Only a LATER slot is
    # accepted next time, so the same code can never be used twice.
    last_used_step = models.BigIntegerField(default=0)

    def __str__(self):
        return f"Authenticator for {self.user}"


class TwoFactorRecoveryCode(models.Model):
    """A one-time code for when the phone is lost. Ten are made at setup.

    A code looks like "k7wm-p3xq-r9td": the first part (`lookup`) finds the
    row, the rest is checked against `code_hash`, a slow salted password hash
    (Django's make_password). The code itself is shown once and never stored.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="two_factor_recovery_codes"
    )
    lookup = models.CharField(max_length=8)
    code_hash = models.CharField(max_length=200)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "lookup"])]

    def __str__(self):
        return f"Recovery code for {self.user}"


class TwoFactorAuditEvent(models.Model):
    """What happened with two-factor sign-in, and who did it. Never a secret,
    a code or a password - only the fact that something happened."""

    class Kind(models.TextChoices):
        POLICY_CHANGED = "policy_changed", "Policy changed"
        ENABLED = "enabled", "Two-factor turned on"
        DISABLED = "disabled", "Two-factor turned off"
        RESET_BY_ADMIN = "reset_by_admin", "Reset by an admin"
        RESET_FROM_SERVER = "reset_from_server", "Reset from the server command"
        RECOVERY_CODE_USED = "recovery_code_used", "Recovery code used"
        RECOVERY_CODES_RENEWED = "recovery_codes_renewed", "New recovery codes made"
        LOCKED_OUT = "locked_out", "Too many wrong codes"

    kind = models.CharField(max_length=30, choices=Kind.choices)
    # Whose two-factor it is about (empty for a policy change).
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Who did it (an admin, the person themselves, or empty for the server).
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    detail = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_kind_display()} ({self.created_at:%Y-%m-%d %H:%M})"
