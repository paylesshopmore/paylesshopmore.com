"""Whose goods are these? Finding the customer, and tying the goods to them.

Goods arrive at the warehouse and are written up on an intake sheet. Usually
the scan already recognises them (warehouse/scanning.py) and the sheet is
linked to the customer's shipment or booking from the start. When it is not -
a supplier's own barcode, a label torn off - the sheet has no customer, and
sits in the "Without a customer" queue until somebody identifies the owner.

THREE RULES this module exists to keep:

  1. Never a new customer. Goods are only ever put under an EXISTING
     customer account. Nothing here can create one, so a lookup that finds
     nobody cannot produce a duplicate account - the sheet stays in the
     queue instead.
  2. Never a guess. lookup() only answers "who might this be"; nothing is
     linked until a person has looked at the candidate and confirmed
     (assign()). A name that matches several customers lists all of them.
  3. Every assignment is on the record (IntakeAssignment, append-only):
     who, when, how the customer was found, and - for a change - from whom,
     to whom and why. Changing an existing assignment is for admins and
     warehouse managers only.

What a warehouse worker sees of a customer is what they need to recognise
them and nothing more: name, customer number, a masked e-mail address, the
town, and their open shipments and bookings. No phone number, no full
address, no invoices or payments.
"""

import re

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.models import Package
from bookings.models import Booking

from .models import IntakeAssignment, IntakeSheet
from .operations import WarehouseConflict

User = get_user_model()

# How many customers one lookup may return. A name matching more than this is
# too vague to choose from: the worker is asked for something more specific.
MAX_RESULTS = 10
# Open shipments and bookings shown per customer, to link the goods to.
MAX_OPEN = 10
MIN_QUERY = 2

# "PLSM-C00012", "plsm-c12", "C00012" or just "12" (see User.customer_code).
CUSTOMER_CODE = re.compile(r"^(?:plsm-?)?c?-?0*(\d{1,9})$", re.IGNORECASE)

OPEN_BOOKING_STATUSES = (
    Booking.Status.NEW,
    Booking.Status.CONFIRMED,
    Booking.Status.BOOKED_IN,
)


def mask_email(address):
    """k***@example.com: enough to recognise, not enough to copy."""
    if not address or "@" not in address:
        return ""
    name, domain = address.split("@", 1)
    return f"{name[:1]}***@{domain}"


def _customers():
    """Who goods may be put under: active customer accounts, not erased."""
    return User.objects.filter(
        role=User.Role.CUSTOMER, is_active=True, anonymised_at__isnull=True
    )


def _open_packages(customer):
    return (
        Package.objects.filter(user=customer)
        .exclude(warehouse_stage=Package.WarehouseStage.SHIPPED)
        .exclude(status__in=[Package.Status.CANCELLED, Package.Status.DELIVERED])
        .order_by("-created_at")
    )


def _open_bookings(customer):
    return (
        Booking.objects.filter(user=customer, status__in=OPEN_BOOKING_STATUSES)
        .order_by("-created_at")
    )


def describe(customer):
    """A customer as the warehouse sees them: enough to recognise them."""
    address = customer.addresses.filter(is_default=True).first() or customer.addresses.first()
    return {
        "id": customer.pk,
        "name": customer.get_full_name() or mask_email(customer.email),
        "customer_code": customer.customer_code,
        "email": mask_email(customer.email),
        "city": address.city if address else "",
        "country": address.country if address else "",
        "open_shipments": [
            {
                "id": package.pk,
                "tracking_number": package.tracking_number,
                "stage": package.warehouse_stage,
                "stage_display": package.get_warehouse_stage_display(),
            }
            for package in _open_packages(customer)[:MAX_OPEN]
        ],
        "open_bookings": [
            {
                "id": booking.pk,
                "shipping_number": booking.shipping_number,
                "destination": booking.destination_label,
                "status": booking.status,
            }
            for booking in _open_bookings(customer)[:MAX_OPEN]
        ],
    }


# ------------------------------------------------------------------ lookup


def _by_reference(code):
    """Customers a shipment, booking, sheet or courier number belongs to.

    Exact matches only (whatever the case): a reference either is the one on
    the label or it is not, and "close to" somebody's tracking number is how
    goods end up with the wrong person. Yields (user_id, reason).
    """
    from prealerts.models import PreAlert
    from tracking.models import CarrierShipment

    for user_id in Package.objects.filter(tracking_number__iexact=code).values_list("user_id", flat=True):
        yield user_id, "tracking_number"
    for user_id in Booking.objects.filter(shipping_number__iexact=code).values_list("user_id", flat=True):
        yield user_id, "shipping_number"
    for user_id in IntakeSheet.objects.filter(reference__iexact=code).values_list("customer_id", flat=True):
        yield user_id, "consignment"
    for user_id in PreAlert.objects.filter(
        Q(tracking_number__iexact=code) | Q(reference__iexact=code)
    ).values_list("user_id", flat=True):
        yield user_id, "courier_tracking"
    for user_id in CarrierShipment.objects.filter(tracking_number__iexact=code).values_list(
        "owner_id", flat=True
    ):
        yield user_id, "courier_tracking"


def lookup(query):
    """Customers this text could mean, with how each was found.

    Tried, in this order, and all of them (a code can be both a customer
    number and a tracking number):
      - customer number      PLSM-C00012, C12, 12           exact
      - e-mail address       the whole address, any case   exact
      - shipment, booking, consignment or courier number   exact
      - name                 every word must appear        partial
    Exact matches are marked `exact`; a name match is not, and the app says
    so: two customers can share a name.

    Returns {"results": [...], "too_many": bool}. Never writes anything.
    """
    query = " ".join(str(query or "").split())[:100]
    # A bare number is a customer number however short ("7"); anything else
    # needs a couple of characters to mean something.
    if len(query) < MIN_QUERY and not query.isdigit():
        raise ValidationError({"q": [f"Type at least {MIN_QUERY} characters."]})

    found = {}  # user_id -> {"reasons": [...], "exact": bool}

    def add(user_id, reason, exact):
        if user_id is None:
            return
        entry = found.setdefault(user_id, {"reasons": [], "exact": False})
        if reason not in entry["reasons"]:
            entry["reasons"].append(reason)
        entry["exact"] = entry["exact"] or exact

    code = CUSTOMER_CODE.match(query)
    if code:
        for user_id in _customers().filter(customer_number=int(code.group(1))).values_list("pk", flat=True):
            add(user_id, "customer_number", True)

    if "@" in query:
        for user_id in _customers().filter(email__iexact=query).values_list("pk", flat=True):
            add(user_id, "email", True)

    if " " not in query:
        for user_id, reason in _by_reference(query):
            add(user_id, reason, True)

    words = [word for word in query.split(" ") if len(word) >= MIN_QUERY]
    if words and "@" not in query:
        by_name = _customers()
        for word in words:
            by_name = by_name.filter(Q(first_name__icontains=word) | Q(last_name__icontains=word))
        for user_id in by_name.values_list("pk", flat=True)[: MAX_RESULTS + 1]:
            add(user_id, "name", False)

    # Only customers who may receive goods: a reference that belongs to a
    # staff account or an erased one finds nobody.
    customers = {
        customer.pk: customer
        for customer in _customers().filter(pk__in=found).prefetch_related("addresses")
    }
    ordered = sorted(
        (user_id for user_id in found if user_id in customers),
        # Exact matches first, then by name.
        key=lambda user_id: (not found[user_id]["exact"], customers[user_id].get_full_name().casefold()),
    )
    return {
        "results": [
            {
                **describe(customers[user_id]),
                "matched_by": found[user_id]["reasons"],
                "exact": found[user_id]["exact"],
            }
            for user_id in ordered[:MAX_RESULTS]
        ],
        "too_many": len(ordered) > MAX_RESULTS,
    }


# ------------------------------------------------------------------ assign


def owner_of(package=None, booking=None):
    """The customer a shipment or booking belongs to (None for a booking sent
    without an account)."""
    if package is not None:
        return package.user_id
    if booking is not None:
        return booking.user_id
    return None


def sync_from_links(sheet):
    """Fill in the sheet's customer from its shipment or booking, if empty.

    Called after a sheet is created or saved. A sheet started from a scan of
    a known shipment is identified from the start - it never shows up in
    the queue.
    """
    if sheet.customer_id is not None:
        return
    owner = owner_of(sheet.package, sheet.booking)
    if owner is not None:
        IntakeSheet.objects.filter(pk=sheet.pk, customer__isnull=True).update(customer_id=owner)
        sheet.customer_id = owner


def check_link_change(sheet, package, booking):
    """Refuse an ordinary sheet save that would move the goods to somebody else.

    The intake form can send `package` and `booking`. If they belong to a
    different customer than the one the sheet is already under, that is a
    change of owner - which goes through assign(), with its permission check
    and its record - not through a form save.
    """
    if sheet.customer_id is None:
        return
    for linked in (package, booking):
        if linked is None:
            continue
        owner = linked.user_id
        if owner is not None and owner != sheet.customer_id:
            raise ValidationError(
                {"customer": ["That belongs to another customer. Use 'Assign customer' to move the goods."]}
            )


def _the_customer(customer_id):
    if not str(customer_id or "").isdigit():
        raise ValidationError({"customer": ["Choose a customer."]})
    customer = _customers().filter(pk=int(customer_id)).first()
    if customer is None:
        raise ValidationError({"customer": ["That is not an active customer account."]})
    return customer


def _the_package(package_id, customer):
    if package_id in (None, ""):
        return None
    if not str(package_id).isdigit():
        raise ValidationError({"package": ["Must be a shipment id."]})
    package = _open_packages(customer).filter(pk=int(package_id)).first()
    if package is None:
        raise ValidationError({"package": ["That is not an open shipment of this customer."]})
    return package


def _the_booking(booking_id, customer):
    if booking_id in (None, ""):
        return None
    if not str(booking_id).isdigit():
        raise ValidationError({"booking": ["Must be a booking id."]})
    booking = _open_bookings(customer).filter(pk=int(booking_id)).first()
    if booking is None:
        raise ValidationError({"booking": ["That is not an open booking of this customer."]})
    return booking


def assign(sheet, user, *, customer_id, package_id=None, booking_id=None, matched_by="", reason=""):
    """Put the goods on `sheet` under an existing customer, and record it.

    Optionally with one of that customer's open shipments or bookings, which
    must really be theirs. Anybody on the floor may identify goods that have
    no customer yet; moving goods that already have one to somebody else is
    for admins and warehouse managers, and needs a reason.

    A released sheet has gone to the office and is refused (reopen it first).
    Returns the sheet.
    """
    customer = _the_customer(customer_id)
    package = _the_package(package_id, customer)
    booking = _the_booking(booking_id, customer)
    reason = str(reason or "").strip()[:500]
    matched_by = str(matched_by or "").strip()[:200]

    with transaction.atomic():
        sheet = IntakeSheet.objects.select_for_update().get(pk=sheet.pk)
        if sheet.released:
            raise WarehouseConflict("This sheet has gone to the office. Reopen it before changing the customer.")

        previous = sheet.customer_id
        changing = previous is not None and previous != customer.pk
        if changing:
            if not user.can_manage_warehouse:
                raise PermissionDenied(
                    "These goods are already under a customer. Ask a manager to change it."
                )
            if not reason:
                raise ValidationError({"reason": ["Say why the customer is being changed."]})

        unchanged = (
            previous == customer.pk
            and (package is None or package.pk == sheet.package_id)
            and (booking is None or booking.pk == sheet.booking_id)
        )
        if unchanged:
            return sheet

        sheet.customer = customer
        if changing:
            # The old customer's shipment and booking are not this one's.
            sheet.package = package
            sheet.booking = booking
        else:
            if package is not None:
                sheet.package = package
            if booking is not None:
                sheet.booking = booking
        if not sheet.recipient.strip():
            sheet.recipient = customer.get_full_name()
        sheet.save(update_fields=["customer", "package", "booking", "recipient", "updated_at"])

        IntakeAssignment.objects.create(
            sheet=sheet,
            kind=IntakeAssignment.Kind.CHANGED if changing else IntakeAssignment.Kind.ASSIGNED,
            from_customer_id=previous,
            to_customer=customer,
            package=package,
            booking=booking,
            matched_by=matched_by,
            reason=reason,
            user=user,
        )
    return sheet
