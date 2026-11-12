"""Which ordered products have arrived at the warehouse, and how many.

READ THIS FIRST
===============

Where the numbers come from
---------------------------

* ORDERED comes from the customer's booking form: one BookingProduct per
  order line ("Chair", quantity 5). Backend bookings/models.py.

* RECEIVED comes from the warehouse: when a worker opens a delivery's boxes,
  they count each order line and confirm the count on that delivery's intake
  sheet. Each confirmed count is one ProductReceipt row (warehouse/models.py).
  A product that came in two deliveries has two rows, and they are ADDED UP:

      sheet 001 (Monday)       chair: 3
      sheet 004 (next week)    chair: 2
      ---------------------------------
      received                 chair: 5

* STILL EXPECTED is simply ordered - received (never below 0).

How the status is chosen (status_for below)
-------------------------------------------

    received is unknown                  -> "unknown"       Ontvangststatus onbekend
    received >= ordered                  -> "received"      Ontvangen
    received is 1 or more (but < ordered)-> "partial"       Gedeeltelijk ontvangen
    received is 0                        -> "not_received"  Nog niet ontvangen

Example: 5 chairs ordered, 3 counted -> "5 besteld · 3 ontvangen · 2 nog
verwacht", status "partial".

When is "received" unknown?
---------------------------

When a product has NO count at all, there are two very different cases:

1. Nothing has arrived for this order yet. Then 0 is the truth: "not_received".

2. Something HAS arrived (a released intake sheet, a package that was scanned
   in, or a shipment that already left), but nobody counted this product.
   A package scan only says "a box came in", not what was inside it - so we
   must not claim 0 and we must not claim it arrived. That is "unknown".

The office's "received" button
------------------------------

An admin in the office can also confirm, on Dashboard -> Bookings, that a
whole store order ("everything from bol.com") or one product has arrived
(BookingOrder.received_at / BookingProduct.received_at). That confirmation
WINS: the product counts as fully received, even when nobody counted it on
an intake sheet. See office_confirmed() below.

    office confirmed, 5 ordered, 3 counted  -> received 5, "received"
    office confirmed, old store row         -> "received"

Older bookings from before order lines existed (only a store and a free-text
description, or only a "contents" line) cannot be counted per product at
all; their lines are always "unknown" too.

Who may see and change what
---------------------------

* customer_overview() is only ever called with a package the view already
  limited to the signed-in customer (accounts/views.py PackageViewSet).
* confirm_counts() is only reachable through the intake sheet API, which only
  warehouse workers, warehouse managers and the office can use
  (IsWarehouseOrStaff in staff/permissions.py).
"""

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from .models import IntakeSheet, ProductReceipt, ProductReceiptChange

# The four statuses. The frontend translates them (Ontvangen, ...).
RECEIVED = "received"
PARTIAL = "partial"
NOT_RECEIVED = "not_received"
UNKNOWN = "unknown"

# More units than this of one product in one delivery is a typing mistake
# (an extra zero), not a delivery.
MAX_COUNT = 9999


class CountRefused(Exception):
    """A count that cannot be saved. The message is shown to the worker."""


# ---------------------------------------------------------------------------
# The status rule
# ---------------------------------------------------------------------------


def status_for(ordered, received):
    """The status of one order line. See the table at the top of this file.

    status_for(5, 5)    -> "received"
    status_for(5, 7)    -> "received"      (more arrived than ordered)
    status_for(5, 3)    -> "partial"
    status_for(5, 0)    -> "not_received"
    status_for(5, None) -> "unknown"
    """
    if received is None or ordered is None:
        return UNKNOWN
    if received >= ordered:
        return RECEIVED
    if received > 0:
        return PARTIAL
    return NOT_RECEIVED


def still_expected(ordered, received):
    """Ordered minus received, never below 0. None when either is unknown."""
    if received is None or ordered is None:
        return None
    return max(ordered - received, 0)


# ---------------------------------------------------------------------------
# Finding the booking and the deliveries that belong together
# ---------------------------------------------------------------------------


def booking_for_package(package):
    """The booking (order) a shipment was made from, or None.

    Only a booking of the SAME customer counts: the shipment was already
    checked to be the signed-in customer's, and this makes sure the order
    behind it is theirs too.
    """
    from bookings.models import Booking

    return Booking.objects.filter(package=package, user_id=package.user_id).first()


def booking_for_sheet(sheet):
    """The booking whose products can be counted on this intake sheet.

    The sheet's own booking link first. A sheet linked only to a shipment
    gets the booking that shipment was made from. None when neither exists:
    then there is no order to count against.
    """
    from bookings.models import Booking

    if sheet.booking_id:
        return sheet.booking
    if sheet.package_id:
        return Booking.objects.filter(package_id=sheet.package_id).first()
    return None


def sheets_for(booking, package):
    """Every intake sheet (delivery) of this order that still counts.

    Linked to the booking or to its shipment. Archived sheets are left out:
    a manager archives a sheet that should never have been started (a double,
    a delivery that never came), so its counts must not be added up.
    """
    link = Q()
    if booking is not None:
        link |= Q(booking=booking)
    if package is not None:
        link |= Q(package=package)
    if not link:
        return IntakeSheet.objects.none()
    return IntakeSheet.objects.filter(link, archived_at__isnull=True)


def received_per_product(booking, sheets):
    """{product id: total confirmed units} for this booking, added up over
    every delivery (sheet) that counts.

    Only counts on THIS order's sheets and for THIS order's products are
    added: a count left on a sheet that was later linked to another order is
    ignored, so it can never end up on the wrong customer's page.
    """
    rows = (
        ProductReceipt.objects.filter(product__booking=booking, sheet__in=sheets)
        .values("product_id")
        .annotate(total=Sum("quantity"))
    )
    return {row["product_id"]: row["total"] for row in rows}


def goods_arrived(package, sheets):
    """True when something of this order has physically come in.

    Any one of these is enough:
      * a delivery's intake sheet was released (filled in and handed over);
      * the shipment was scanned in at the warehouse (its warehouse stage is
        past "expected");
      * the shipment is already ready, on its way or delivered.

    Used only to tell "nothing came yet" (0 received) from "something came
    but this product was never counted" (unknown).
    """
    from accounts.models import Package

    if sheets.filter(status=IntakeSheet.Status.RELEASED).exists():
        return True
    if package is None:
        return False
    if package.warehouse_stage and package.warehouse_stage != Package.WarehouseStage.AWAITING_PICKUP:
        return True
    return package.status in (
        Package.Status.READY_FOR_SHIPPING,
        Package.Status.IN_TRANSIT,
        Package.Status.ARRIVED,
        Package.Status.DELIVERED,
    )


def office_confirmed(product):
    """True when an admin confirmed this product, or its whole store order,
    as received (the buttons on Dashboard -> Bookings)."""
    return bool(product.received_at or product.order.received_at)


# ---------------------------------------------------------------------------
# The customer's overview
# ---------------------------------------------------------------------------


def _line(key, name, store, ordered, received):
    """One row of the overview, in the shape the customer's page reads."""
    return {
        "id": key,
        "name": name,
        "store": store,
        "ordered": ordered,
        "received": received,
        "expected": still_expected(ordered, received),
        "status": status_for(ordered, received),
    }


def customer_overview(package):
    """Every product of the order behind this shipment, with what arrived.

    `package` MUST already be one of the signed-in customer's own shipments
    (the view's queryset makes sure). Returns a list of rows; see _line.

    Step by step:
      1. Find the booking (order) behind the shipment.
      2. No booking, or an old booking without order lines: show what we
         know about the contents, with status "unknown".
      3. Otherwise add up the confirmed counts per order line and work out
         each line's status.
    """
    # 1. The order.
    booking = booking_for_package(package)

    # 2a. A shipment the office made without a booking form: we only have
    #     its description.
    if booking is None:
        name = (package.description or "").strip() or package.tracking_number
        return [_line(f"package-{package.pk}", name, "", None, None)]

    return booking_lines(booking, package)


def booking_lines(booking, package=None):
    """Every product of one booking, with what arrived - the rows of
    customer_overview(), worked out from the booking itself.

    Used by the customer's page (through customer_overview) and by the
    office's Bookings page (bookings/serializers.py), so both always show
    the same numbers. `package` is the booking's shipment, or None while
    the booking has none yet.
    """
    products = list(booking.products.select_related("order").order_by("order__position", "position", "id"))

    # 2b. A booking from before order lines existed: one row per store, or
    #     one row with the typed contents. Never counted, so unknown.
    if not products:
        orders = list(booking.orders.all())
        if orders:
            lines = []
            for order in orders:
                line = _line(f"order-{order.pk}", order.description, order.shop_name, None, None)
                # No numbers to show, but the office confirmed it arrived.
                if order.received_at:
                    line["status"] = RECEIVED
                lines.append(line)
            return lines
        name = (booking.contents or "").strip() or booking.shipping_number or f"#{booking.pk}"
        return [_line(f"booking-{booking.pk}", name, "", None, None)]

    # 3. Add up the counts and pick each line's status.
    sheets = sheets_for(booking, package)
    totals = received_per_product(booking, sheets)
    arrived = goods_arrived(package, sheets)

    lines = []
    for product in products:
        if office_confirmed(product):
            # The office confirmed it arrived: all of it, at least.
            received = max(totals.get(product.pk, 0), product.quantity)
        elif product.pk in totals:
            # Counted at least once: the sum of every confirmed count.
            received = totals[product.pk]
        elif arrived:
            # Goods came in, but nobody counted this product: unknown.
            received = None
        else:
            # Nothing came in yet: honestly 0.
            received = 0
        lines.append(_line(product.pk, product.description, product.order.shop_name, product.quantity, received))
    return lines


# ---------------------------------------------------------------------------
# The warehouse's side: counting on one intake sheet
# ---------------------------------------------------------------------------


def sheet_lines(sheet):
    """What the warehouse sees on an intake sheet's "Products received" box.

    None when the sheet has no order to count against. Otherwise one row per
    order line with:
      counted_here       this delivery's confirmed count (None: not counted)
      counted_elsewhere  the confirmed counts of the order's OTHER deliveries
      received           the two added up - what the customer sees
    """
    booking = booking_for_sheet(sheet)
    if booking is None:
        return None

    products = list(booking.products.select_related("order").order_by("order__position", "position", "id"))
    here = {
        receipt.product_id: receipt
        for receipt in sheet.product_receipts.select_related("confirmed_by")
    }
    others = received_per_product(booking, sheets_for(booking, booking.package).exclude(pk=sheet.pk))

    rows = []
    for product in products:
        receipt = here.get(product.pk)
        counted_here = receipt.quantity if receipt else None
        counted_elsewhere = others.get(product.pk, 0)
        received = (counted_here or 0) + counted_elsewhere
        if office_confirmed(product):
            # The office confirmed it arrived, so it is all here.
            received = max(received, product.quantity)
        who = receipt.confirmed_by if receipt else None
        rows.append(
            {
                "product": product.pk,
                "name": product.description,
                "store": product.order.shop_name,
                "ordered": product.quantity,
                "counted_here": counted_here,
                "counted_elsewhere": counted_elsewhere,
                "received": received,
                "expected": still_expected(product.quantity, received),
                "status": status_for(product.quantity, received),
                "confirmed_by": (who.get_full_name() or who.get_username()) if who else "",
                "confirmed_at": receipt.confirmed_at if receipt else None,
            }
        )
    return {
        "booking": booking.pk,
        "shipping_number": booking.shipping_number,
        "lines": rows,
    }


def confirm_counts(sheet, counts, user):
    """Save (confirm) the counts for this delivery, or correct earlier ones.

    `counts` is a list of {"product": <order line id>, "quantity": <units>}.
    Raises CountRefused, and saves nothing at all, when:
      * the sheet was archived;
      * the sheet has no order to count against;
      * a product is not an order line of THIS sheet's order (this is what
        keeps a count on the right order when two orders hold the same
        product), or is listed twice;
      * a quantity is not a whole number from 0 to MAX_COUNT.

    A count that did not change is left alone. Every new or changed count is
    also written to ProductReceiptChange (who, when, before, after).
    Returns sheet_lines(sheet), so the screen shows the result at once.
    """
    if sheet.archived:
        raise CountRefused("This intake sheet was archived; counts can no longer be changed.")
    booking = booking_for_sheet(sheet)
    if booking is None:
        raise CountRefused("Link this intake sheet to a booking first; then its products can be counted.")

    own_products = set(booking.products.values_list("pk", flat=True))
    wanted = {}
    for item in counts:
        product_id = item["product"]
        quantity = item["quantity"]
        if product_id not in own_products:
            raise CountRefused("A product in this list is not part of this sheet's order.")
        if product_id in wanted:
            raise CountRefused("A product is listed twice.")
        if not 0 <= quantity <= MAX_COUNT:
            raise CountRefused(f"A count must be between 0 and {MAX_COUNT}.")
        wanted[product_id] = quantity

    now = timezone.now()
    with transaction.atomic():
        # Locked, so two workers saving the same sheet at the same moment are
        # handled one after the other and the history stays in order.
        existing = {
            receipt.product_id: receipt
            for receipt in ProductReceipt.objects.select_for_update().filter(
                sheet=sheet, product_id__in=wanted
            )
        }
        for product_id, quantity in wanted.items():
            receipt = existing.get(product_id)
            if receipt is not None and receipt.quantity == quantity:
                continue  # unchanged: nothing to confirm again
            before = receipt.quantity if receipt else None
            if receipt is None:
                ProductReceipt.objects.create(
                    sheet=sheet, product_id=product_id, quantity=quantity, confirmed_by=user, confirmed_at=now
                )
            else:
                receipt.quantity = quantity
                receipt.confirmed_by = user
                receipt.confirmed_at = now
                receipt.save(update_fields=["quantity", "confirmed_by", "confirmed_at"])
            ProductReceiptChange.objects.create(
                sheet=sheet,
                product_id=product_id,
                quantity_before=before,
                quantity_after=quantity,
                user=user,
                created_at=now,
            )
    return sheet_lines(sheet)
