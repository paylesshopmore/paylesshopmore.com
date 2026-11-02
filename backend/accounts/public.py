"""What the public site reads about shipments.

Two endpoints, both read-only: looking up one shipment by its tracking
number, and the counts in the homepage's statistics band. The counts are
open to anyone; the lookup takes a signed-in customer.

The rule that shapes this whole module: a tracking number is an identifier,
not a credential. It is printed on paperwork, forwarded in e-mails and read
out over the phone, and it is short enough to guess at. So holding one is not
enough to follow a shipment - the lookup only finds the caller's own - and
what comes back is still the least that is useful: where the package is in
its journey and which island it is going to, never who is receiving it,
where they live, or what is inside.
"""

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from enquiries.models import QuoteRequest

from .models import Package, SiteSettings

User = get_user_model()

# The stages a customer is shown, in order, so the tracking page can draw the
# timeline with everything before the current stage marked done. Cancelled is
# not here: it is not a stage on the way to anywhere.
# The journey as a customer sees it: the office's statuses, with the warehouse's
# own steps filled in between "purchased" and "in transit". Only progress is
# shown - never damage, problems, locations or who did the work.
# The steps the customer sees, in order. Deliberately fewer than the
# statuses and warehouse stages behind them: "Paid" and "Products purchased"
# are left out, and everything that happens in the warehouse (receiving,
# weighing, measuring, packing) is the one "received" step.
#
# The last step depends on how the customer gets the shipment: see
# public_stages() below.
PUBLIC_STAGES = [
    ("received", "Received at our warehouse"),
    (Package.Status.READY_FOR_SHIPPING, "Ready for shipping"),
    (Package.Status.IN_TRANSIT, "In transit"),
    (Package.Status.ARRIVED, "Arrived at destination"),
    (Package.Status.DELIVERED, "Delivered"),
]
_STAGE_VALUES = [value for value, _ in PUBLIC_STAGES]

_Stage = Package.WarehouseStage
# Where each warehouse stage puts a package on the public timeline.
# Everything from arriving at the warehouse until it is ready to go is the
# one "received" step.
_WAREHOUSE_TO_PUBLIC = {
    _Stage.RECEIVED: "received",
    _Stage.AWAITING_MEASUREMENT: "received",
    _Stage.MEASURED: "received",
    _Stage.AWAITING_PACKAGING: "received",
    _Stage.PACKED: "received",
    _Stage.READY: Package.Status.READY_FOR_SHIPPING,
    _Stage.SHIPPED: Package.Status.IN_TRANSIT,
}


# The last step when the customer collects the shipment themselves, in place
# of "Delivered". Same position, so public_stage_index() needs no change.
PICKED_UP_STAGE = ("picked_up", "Picked up")


def public_stages(package):
    """The timeline steps for this package, as [{"value", "label"}, ...].

    PUBLIC_STAGES, with the last step as "Picked up" instead of "Delivered"
    when the customer comes to collect it (Package.handover).
    """
    stages = list(PUBLIC_STAGES)
    if package.handover == Package.Handover.PICKUP:
        stages[-1] = PICKED_UP_STAGE
    return [{"value": value, "label": label} for value, label in stages]


def public_stage_index(package):
    """How far along the public timeline a package is, or -1 if not on it.

    The furthest of what the office's status says and what the warehouse's
    stage says: the two are updated by different people, and whichever has
    moved on is the truth about where the package is. Quoted and cancelled
    are not on the timeline at all.

    Paid and purchased are not steps any more: a package in one of those is
    on the timeline but before its first step (-1), until the warehouse
    receives it.
    """
    if package.status in (Package.Status.QUOTED, Package.Status.CANCELLED):
        return -1
    index = _STAGE_VALUES.index(package.status) if package.status in _STAGE_VALUES else -1
    step = _WAREHOUSE_TO_PUBLIC.get(package.warehouse_stage)
    if step is not None:
        index = max(index, _STAGE_VALUES.index(step))
    return index


class PublicPackageSerializer(serializers.ModelSerializer):
    """What the tracking page may show about a shipment.

    Every field is listed by hand, and the list is short on purpose. Building
    this from `exclude` would quietly start publishing the delivery address
    the day somebody reordered the model.
    """

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    destination = serializers.CharField(source="destination_label", read_only=True)
    progress = serializers.IntegerField(read_only=True)
    stage_index = serializers.SerializerMethodField()
    stages = serializers.SerializerMethodField()
    # Safe to publish, and the reason the tracking page can say "this one has
    # gone" without the visitor having to know which statuses mean that. The
    # sentence itself is not sent: the React app has it in three languages,
    # and lock_reason is English. See Package.locked.
    locked = serializers.BooleanField(read_only=True)

    class Meta:
        model = Package
        fields = [
            "tracking_number",
            "status",
            "status_display",
            "locked",
            "destination",
            "progress",
            "stage_index",
            "stages",
            "handover",
            "shipped_at",
            "delivered_at",
            "estimated_arrival",
        ]
        read_only_fields = fields

    def get_stages(self, obj):
        return public_stages(obj)

    def get_stage_index(self, obj):
        """Which stage the shipment is at, or -1 when it is not on the list.

        Quoted and cancelled both land on -1: one has not started, the other
        stopped, and neither is a point on the timeline.
        """
        return public_stage_index(obj)


class TrackingView(APIView):
    """GET /api/track/<tracking_number>/ — one of the caller's shipments.

    Signed in only, and only the caller's own shipments: until it was, anyone
    with a tracking number - or a lucky guess at one - could follow somebody
    else's parcel. The office can look up any shipment, as it can every
    customer's paperwork.

    404 for an unknown number, and the same 404 for somebody else's, so the
    answer does not confirm that a number exists. Still throttled: a customer
    refreshing their own shipment needs nowhere near the limit.
    """

    permission_classes = [IsAuthenticated]
    throttle_scope = "tracking"
    throttle_classes = [ScopedRateThrottle]

    def get(self, request, tracking_number):
        packages = Package.objects.select_related("delivery_address")
        # Narrowed before the number is looked at, so somebody else's
        # shipment is never found at all rather than found and then refused.
        if not request.user.is_staff:
            packages = packages.filter(user=request.user)

        # Case-insensitive and trimmed, because this is typed in by hand from
        # a label or an e-mail, often with a stray space.
        package = packages.filter(
            tracking_number__iexact=tracking_number.strip()
        ).first()

        if package is not None:
            return Response(
                PublicPackageSerializer(package).data
                | {"kind": "shipment"}
                | _order_details(package)
            )

        # Not one of our PLSM numbers: perhaps the courier's number of one of
        # the caller's webshop orders (tracking app). Same rule: only the
        # caller's own, narrowed before the number is looked at.
        courier = _own_courier_shipment(request.user, tracking_number)
        if courier is not None:
            from tracking.serializers import CustomerShipmentSerializer

            return Response(CustomerShipmentSerializer(courier).data | {"kind": "courier"})

        return Response(
            {"detail": "No shipment found with that tracking number."},
            status=status.HTTP_404_NOT_FOUND,
        )


def _order_details(package):
    """The rest of the order, for the Track & Trace box on the profile page.

    Safe to send because of who can get here: the shipment's own customer (or
    staff) - TrackingView never finds anybody else's. Gives:
      booking  the booking it was ordered with: its number and when;
      orders   the webshop orders in it, each with its courier tracking
               (incoming: shop -> our warehouse);
      onward_trackings  courier numbers of the shipment itself on its way to
               the island (outgoing), when it travels with an outside courier.
    No database ids: the page finds the full shipment ("My shipments") by
    its tracking number.
    """
    from bookings.serializers import MyOrderSerializer
    from tracking.serializers import CustomerShipmentSerializer

    onward = CustomerShipmentSerializer(
        package.onward_shipments.select_related("carrier").prefetch_related("events"), many=True
    ).data
    booking = getattr(package, "booking", None)
    if booking is None:
        return {"booking": None, "orders": [], "onward_trackings": onward}

    orders = booking.orders.prefetch_related(
        "screenshots", "carrier_shipments__carrier", "carrier_shipments__events"
    )
    return {
        "booking": {
            "shipping_number": booking.shipping_number,
            "created_at": booking.created_at,
        },
        "orders": MyOrderSerializer(orders, many=True).data,
        "onward_trackings": onward,
    }


def _own_courier_shipment(user, typed):
    """The caller's courier shipment for this number, or None.

    The number is the courier's (3SABC1234567), or a pre-alert's reference
    (PA-2026-000123) - the one in the "your pre-alert is registered" e-mail.
    """
    from tracking.models import CarrierShipment
    from tracking.normalize import InvalidTrackingNumber, normalize_tracking_number

    shipments = CarrierShipment.objects.select_related(
        "carrier", "owner", "order__booking__package", "prealert__package", "onward_package"
    ).prefetch_related("events")
    if not user.is_staff:
        shipments = shipments.filter(owner=user)

    by_reference = shipments.filter(prealert__reference__iexact=typed.strip()).first()
    if by_reference is not None:
        return by_reference
    try:
        number = normalize_tracking_number(typed)
    except InvalidTrackingNumber:
        return None
    return shipments.filter(tracking_number=number).first()


class SiteSwitchesView(APIView):
    """GET /api/site/ — which pages of the public site are switched on.

    The admin sets these in the Django admin (Site settings). The site asks
    once per visit and hides the links (and the page) of anything that is off.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        site = SiteSettings.load()
        return Response({"show_calculator": site.show_calculator})


class SiteStatsView(APIView):
    """GET /api/stats/ — the numbers behind the homepage statistics band.

    Real counts, not decoration. They start small, and that is the point: a
    figure on a public page is a claim, and one nobody has to stand behind is
    worth less than a small true one.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        # Hidden by an admin: say so and nothing else. The counts are business
        # figures (how many customers, how many quotes) that are only public
        # because the band publishes them; with the band off they are not.
        if not SiteSettings.load().show_stats_band:
            return Response({"visible": False})

        packages = Package.objects.all()

        # Anonymised rows are erased customers whose shipment records had to
        # be kept; counting them would overstate the business.
        customers = User.objects.filter(is_active=True, anonymised_at__isnull=True)

        by_status = packages.aggregate(
            delivered=Count("id", filter=Q(status=Package.Status.DELIVERED)),
            in_transit=Count("id", filter=Q(status=Package.Status.IN_TRANSIT)),
            total=Count("id"),
        )

        # Islands actually shipped to, from the addresses packages went to —
        # not the length of the country list we would be willing to serve.
        destinations = (
            packages.exclude(delivery_address__isnull=True)
            .values("delivery_address__country")
            .distinct()
            .count()
        )

        return Response(
            {
                # Whether the homepage shows the band at all - an admin's
                # choice, in the Django admin under "Site settings". Always
                # true here; the hidden case returned above.
                "visible": True,
                "packages_delivered": by_status["delivered"],
                "packages_in_transit": by_status["in_transit"],
                "packages_total": by_status["total"],
                "destinations": destinations,
                "customers": customers.count(),
                "quotes_handled": QuoteRequest.objects.filter(
                    status__in=[QuoteRequest.Status.QUOTED, QuoteRequest.Status.ACCEPTED]
                ).count(),
            }
        )
