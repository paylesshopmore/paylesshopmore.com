"""The office's side of floor devices and PINs: admins and warehouse managers.

Registering a shared phone or scanner as a floor device, revoking one,
choosing which locations (areas of the warehouse) each device may be used in,
resetting a worker's PIN, and reading who signed in where. How a worker signs
in on a device, and what keeps a four-digit PIN from being guessed, is in
accounts/floor.py.
"""

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import mixins, serializers, viewsets
from rest_framework import status as http_status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import floor
from accounts.models import FloorDevice, FloorEvent, FloorLocation
from warehouse.models import WarehouseAccess

from .permissions import IsWarehouseManager

User = get_user_model()

# How many audit rows the dashboard shows. The Django admin has the rest.
RECENT_EVENTS = 200


def _short(user):
    return str(user) if user else None


class FloorDeviceSerializer(serializers.ModelSerializer):
    created_by = serializers.SerializerMethodField()
    revoked_by = serializers.SerializerMethodField()
    # Whether the admin is looking at this list from the device itself, so the
    # page can say "this device" rather than leave them guessing which is which.
    is_this_device = serializers.SerializerMethodField()
    # The locations this device has been granted, as [{id, name}].
    locations = serializers.SerializerMethodField()

    class Meta:
        model = FloorDevice
        fields = [
            "id",
            "name",
            "created_at",
            "created_by",
            "last_seen_at",
            "revoked_at",
            "revoked_by",
            "is_this_device",
            "locations",
        ]
        read_only_fields = fields

    def get_created_by(self, obj):
        return _short(obj.created_by)

    def get_revoked_by(self, obj):
        return _short(obj.revoked_by)

    def get_is_this_device(self, obj):
        return obj.pk == self.context.get("this_device_id")

    def get_locations(self, obj):
        return [
            {"id": grant.location_id, "name": grant.location.name}
            for grant in sorted(obj.access_grants.all(), key=lambda g: g.location.name)
        ]


class FloorLocationSerializer(serializers.ModelSerializer):
    """A location and the warehouse sections that are worked there."""

    device_count = serializers.SerializerMethodField()

    class Meta:
        model = FloorLocation
        fields = ["id", "name", "description", "sections", "device_count", "updated_at"]
        read_only_fields = ["id", "device_count", "updated_at"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Give the location a name.")
        return value

    def validate_sections(self, value):
        if not isinstance(value, list) or not all(isinstance(key, str) for key in value):
            raise serializers.ValidationError("Choose the sections as a list.")
        unknown = sorted(set(value) - set(WarehouseAccess.SECTIONS))
        if unknown:
            raise serializers.ValidationError(f"Unknown section: {', '.join(unknown)}.")
        # Kept in the page's order, without duplicates.
        return [key for key in WarehouseAccess.SECTIONS if key in value]

    def get_device_count(self, obj):
        return obj.device_grants.filter(device__revoked_at__isnull=True).count()


class FloorLocationViewSet(viewsets.ModelViewSet):
    """The warehouse's locations: GET, POST, PATCH, DELETE. Admins only.

    Deleting a location removes every device's grant for it, so those devices
    lose access to its sections at once (once locations are in use, no grant
    means no access).
    """

    serializer_class = FloorLocationSerializer
    permission_classes = [IsWarehouseManager]
    pagination_class = None
    queryset = FloorLocation.objects.all()


class LocationChoice(serializers.Serializer):
    location = serializers.PrimaryKeyRelatedField(queryset=FloorLocation.objects.all())


class FloorDeviceRegistration(serializers.Serializer):
    name = serializers.CharField(max_length=80, trim_whitespace=True)


class FloorDeviceViewSet(
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """GET the floor devices; POST to register the device making the request;
    POST {id}/revoke/ to stop one working.

    Registering is done from the device itself, by an admin signed in on it:
    the answer sets the device's token in a cookie that page scripts cannot
    read, and the admin then signs out. The token is in that cookie and
    nowhere else - not in the answer, not in the database.
    """

    serializer_class = FloorDeviceSerializer
    permission_classes = [IsWarehouseManager]
    pagination_class = None
    queryset = FloorDevice.objects.select_related("created_by", "revoked_by").prefetch_related(
        "access_grants__location"
    )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        device = floor.device_for(self.request)
        context["this_device_id"] = device.pk if device else None
        return context

    def create(self, request):
        body = FloorDeviceRegistration(data=request.data)
        body.is_valid(raise_exception=True)

        device, token = floor.register_device(body.validated_data["name"], request.user)

        response = Response(
            FloorDeviceSerializer(device, context={"this_device_id": device.pk}).data,
            status=http_status.HTTP_201_CREATED,
        )
        floor.set_device_cookie(response, token)
        return response

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        device = self.get_object()
        floor.revoke_device(device, request.user)
        device.refresh_from_db()
        return Response(self.get_serializer(device).data)

    @action(detail=True, methods=["post"], url_path="grant-location")
    def grant_location(self, request, pk=None):
        """POST {"location": id}: let this device be used in that location."""
        device = self.get_object()
        if device.revoked_at:
            return Response(
                {"detail": "This device has been revoked; it cannot be given access."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        body = LocationChoice(data=request.data)
        body.is_valid(raise_exception=True)
        floor.grant_location(device, body.validated_data["location"], request.user)
        return Response(self.get_serializer(self.get_queryset().get(pk=device.pk)).data)

    @action(detail=True, methods=["post"], url_path="revoke-location")
    def revoke_location(self, request, pk=None):
        """POST {"location": id}: stop this device being used in that location."""
        device = self.get_object()
        body = LocationChoice(data=request.data)
        body.is_valid(raise_exception=True)
        floor.revoke_location(device, body.validated_data["location"], request.user)
        return Response(self.get_serializer(self.get_queryset().get(pk=device.pk)).data)


class FloorEventSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    user = serializers.SerializerMethodField()
    device = serializers.SerializerMethodField()
    actor = serializers.SerializerMethodField()

    class Meta:
        model = FloorEvent
        fields = ["id", "kind", "kind_display", "user", "device", "actor", "location", "created_at"]
        read_only_fields = fields

    def get_user(self, obj):
        return _short(obj.user)

    def get_device(self, obj):
        return obj.device.name if obj.device else None

    def get_actor(self, obj):
        return _short(obj.actor)

    location = serializers.CharField(source="location_name", read_only=True)


class FloorEventListView(APIView):
    """GET: the most recent floor sign-ins and PIN changes, newest first."""

    permission_classes = [IsWarehouseManager]

    def get(self, request):
        events = FloorEvent.objects.select_related("user", "device", "actor")[:RECENT_EVENTS]
        return Response(FloorEventSerializer(events, many=True).data)


class WorkerPinResetView(APIView):
    """POST: take a worker's floor PIN away.

    For a PIN that is locked, forgotten, or that somebody else may have seen.
    The worker sets a new one after signing in with an e-mailed code; sending
    them that code is enough on its own, so this is for when the old PIN
    should stop working now.
    """

    permission_classes = [IsWarehouseManager]

    def post(self, request, pk):
        worker = get_object_or_404(User, pk=pk)
        if not floor.reset_pin(worker, request.user):
            return Response(
                {"detail": "That worker has no PIN to reset."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class WorkerPinIssueView(APIView):
    """POST: generate a new PIN for a warehouse worker, shown ONCE.

    For a worker's first PIN, or a replacement for one that was forgotten,
    locked or seen by somebody else: the old PIN stops working at once. The
    answer carries the new PIN in plain text, this one time only - it is
    stored hashed, never logged, and cannot be shown again. The worker signs
    in with it and must then choose their own (WarehousePin.must_change).

    Warehouse workers only (floor.refusal_reason): a manager cannot give a PIN
    to another manager, an admin or the office, who sign in with passwords.
    """

    permission_classes = [IsWarehouseManager]

    def post(self, request, pk):
        worker = get_object_or_404(User, pk=pk)
        try:
            pin = floor.issue_pin(worker, request.user)
        except floor.PinRefused as refusal:
            return Response({"detail": str(refusal)}, status=http_status.HTTP_400_BAD_REQUEST)

        response = Response({"pin": pin, "worker": worker.get_full_name() or worker.email})
        # Never kept by the browser or anything in between: the PIN is in
        # this one answer and nowhere else.
        response["Cache-Control"] = "no-store"
        return response
