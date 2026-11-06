"""Read APIs for the warehouse's own records, mounted under /api/staff/warehouse/.

    activity/        every warehouse action, newest first
    measurements/    every measurement
    packaging/       every packaging action
    damage/          damage reports, with their photos and resolution

All behind IsWarehouseOrStaff, like the rest of the warehouse API: a warehouse
worker and the office read the same rows. Writes do not happen here - they
go through the package they belong to (warehouse/shipments.py), which is
where the rules are checked, via warehouse/operations.py.
"""

from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from staff.permissions import (
    IsStaffOrWarehouseManager,
    IsWarehouseOrStaff,
    WarehouseRateThrottle,
)

from . import operations, report
from .access import SectionAllowed
from .models import (
    PackageActivity,
    PackageDamagePhoto,
    PackageDamageReport,
    PackageMeasurement,
    PackagePackaging,
    PackagePhoto,
)

# Only digits reach a detail route; anything else is a 404 from the router
# rather than a lookup with a string where an integer belongs.
ID_REGEX = r"[0-9]+"


# ---------------------------------------------------------------- fields


def person(user):
    if user is None:
        return None
    return {"id": user.pk, "name": user.get_full_name() or user.get_username()}


def local_date(moment):
    return timezone.localtime(moment).date().isoformat() if moment else None


def local_time(moment):
    return timezone.localtime(moment).strftime("%H:%M") if moment else None


class _PackageBrief(serializers.Serializer):
    def to_representation(self, package):
        return {
            "id": package.pk,
            "package_number": package.package_number,
            "tracking_number": package.tracking_number,
        }


class MeasurementSerializer(serializers.ModelSerializer):
    package = _PackageBrief(read_only=True)
    worker = serializers.SerializerMethodField()
    chargeable_weight_kg = serializers.SerializerMethodField()
    date = serializers.SerializerMethodField()
    time = serializers.SerializerMethodField()
    current = serializers.SerializerMethodField()

    class Meta:
        model = PackageMeasurement
        fields = [
            "id",
            "package",
            "worker",
            "weight_kg",
            "length_cm",
            "width_cm",
            "height_cm",
            "volume_m3",
            "dimensional_weight_kg",
            "chargeable_weight_kg",
            "measured_at",
            "date",
            "time",
            "current",
        ]
        read_only_fields = fields

    def get_worker(self, obj):
        return person(obj.worker)

    def get_chargeable_weight_kg(self, obj):
        return f"{obj.chargeable_weight_kg:.2f}"

    def get_date(self, obj):
        return local_date(obj.measured_at)

    def get_time(self, obj):
        return local_time(obj.measured_at)

    def get_current(self, obj):
        # Reverse one-to-one: missing raises, which getattr's default catches.
        return getattr(obj, "superseded_by", None) is None


class PackagingSerializer(serializers.ModelSerializer):
    package = _PackageBrief(read_only=True)
    worker = serializers.SerializerMethodField()
    packaging_type_display = serializers.CharField(
        source="get_packaging_type_display", read_only=True
    )
    date = serializers.SerializerMethodField()
    time = serializers.SerializerMethodField()

    class Meta:
        model = PackagePackaging
        fields = [
            "id",
            "package",
            "worker",
            "packaging_type",
            "packaging_type_display",
            "quantity",
            "notes",
            "created_at",
            "date",
            "time",
        ]
        read_only_fields = fields

    def get_worker(self, obj):
        return person(obj.worker)

    def get_date(self, obj):
        return local_date(obj.created_at)

    def get_time(self, obj):
        return local_time(obj.created_at)


class DamageReportSerializer(serializers.ModelSerializer):
    package = serializers.SerializerMethodField()
    worker = serializers.SerializerMethodField()
    resolved_by = serializers.SerializerMethodField()
    damage_type_display = serializers.CharField(source="get_damage_type_display", read_only=True)
    resolution_status_display = serializers.CharField(
        source="get_resolution_status_display", read_only=True
    )
    photos = serializers.SerializerMethodField()
    date = serializers.SerializerMethodField()
    time = serializers.SerializerMethodField()

    class Meta:
        model = PackageDamageReport
        fields = [
            "id",
            "package",
            "worker",
            "damage_type",
            "damage_type_display",
            "description",
            "photos",
            "resolution_status",
            "resolution_status_display",
            "resolution_note",
            "resolved_by",
            "resolved_at",
            "created_at",
            "date",
            "time",
        ]
        read_only_fields = fields

    def get_package(self, obj):
        package = obj.package
        return {
            "id": package.pk,
            "package_number": package.package_number,
            "tracking_number": package.tracking_number,
            "customer": (package.user.get_full_name() or package.user.email) if package.user else "",
        }

    def get_worker(self, obj):
        return person(obj.worker)

    def get_resolved_by(self, obj):
        return person(obj.resolved_by)

    def get_photos(self, obj):
        # A path under /api, fetched with the session like every other call.
        return [
            {
                "id": photo.pk,
                "url": f"/staff/warehouse/damage/{obj.pk}/photos/{photo.pk}/",
                "content_type": photo.content_type,
            }
            for photo in obj.photos.all()
        ]

    def get_date(self, obj):
        return local_date(obj.created_at)

    def get_time(self, obj):
        return local_time(obj.created_at)


class ActivitySerializer(serializers.ModelSerializer):
    package = _PackageBrief(read_only=True)
    user = serializers.SerializerMethodField()
    action_display = serializers.CharField(source="get_action_display", read_only=True)
    date = serializers.SerializerMethodField()
    time = serializers.SerializerMethodField()

    class Meta:
        model = PackageActivity
        fields = [
            "id",
            "package",
            "user",
            "action",
            "action_display",
            "description",
            "timestamp",
            "date",
            "time",
        ]
        read_only_fields = fields

    def get_user(self, obj):
        return person(obj.user)

    def get_date(self, obj):
        return local_date(obj.timestamp)

    def get_time(self, obj):
        return local_time(obj.timestamp)


# ---------------------------------------------------------------- filters


def package_id_param(request):
    """`?package=` as an integer, or None. Anything else is a 400."""
    raw = request.query_params.get("package")
    if raw in (None, ""):
        return None
    if not str(raw).isdigit():
        raise ValidationError({"package": ["Must be a package id."]})
    return int(raw)


class _RecordViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """A list filtered by ?package=, ?mine=true and ?today=true.

    Each list belongs to a section an admin can switch off for warehouse
    workers (`access_section`, see warehouse/access.py)."""

    permission_classes = [IsWarehouseOrStaff, SectionAllowed]
    throttle_classes = [WarehouseRateThrottle]
    lookup_value_regex = ID_REGEX

    user_field = "worker"
    time_field = "created_at"

    def filter_queryset(self, queryset):
        request = self.request
        package = package_id_param(request)
        if package is not None:
            queryset = queryset.filter(package_id=package)
        if request.query_params.get("mine") == "true":
            queryset = queryset.filter(**{self.user_field: request.user})
        if request.query_params.get("today") == "true":
            queryset = queryset.filter(**{f"{self.time_field}__date": timezone.localdate()})
        return queryset


class ActivityViewSet(_RecordViewSet):
    access_section = "activity"
    serializer_class = ActivitySerializer
    queryset = PackageActivity.objects.select_related("package", "user")
    user_field = "user"
    time_field = "timestamp"

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        action_name = self.request.query_params.get("action")
        if action_name in PackageActivity.Action.values:
            queryset = queryset.filter(action=action_name)
        return queryset


class MeasurementViewSet(_RecordViewSet):
    access_section = "measurements"
    serializer_class = MeasurementSerializer
    queryset = PackageMeasurement.objects.select_related("package", "worker", "superseded_by")
    time_field = "measured_at"


class PackagingViewSet(_RecordViewSet):
    access_section = "packaging"
    serializer_class = PackagingSerializer
    queryset = PackagePackaging.objects.select_related("package", "worker")


class DamageReportViewSet(mixins.RetrieveModelMixin, _RecordViewSet):
    """Damage reports. ?status=open|resolved. Resolve with POST {id}/resolve/."""

    access_section = "damage"

    serializer_class = DamageReportSerializer
    queryset = PackageDamageReport.objects.select_related(
        "package__user", "worker", "resolved_by"
    ).prefetch_related("photos")

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        status = self.request.query_params.get("status")
        if status in PackageDamageReport.Resolution.values:
            queryset = queryset.filter(resolution_status=status)
        return queryset

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        report = self.get_object()
        operations.resolve_damage(report, request.user, request.data.get("note", ""))
        return Response(self.get_serializer(self.get_queryset().get(pk=report.pk)).data)

    @action(
        detail=True,
        methods=["get"],
        url_path=r"photos/(?P<photo_id>[0-9]+)",
        url_name="photo",
    )
    def photo(self, request, pk=None, photo_id=None):
        """Stream one photo. Scoped to its report, so ids cannot be mixed up."""
        report = self.get_object()
        photo = get_object_or_404(PackageDamagePhoto, pk=photo_id, report=report)

        try:
            handle = photo.image.open("rb")
        except FileNotFoundError as error:
            raise Http404("This photo is missing.") from error

        # The content type is the one sniffed at upload, never the uploader's.
        # nosniff is set site-wide, so the browser will not reinterpret it.
        response = FileResponse(handle, content_type=photo.content_type)
        response["Cache-Control"] = "private, max-age=3600"
        return response


class WarehouseReportView(APIView):
    """GET /api/staff/warehouse/report/?date=YYYY-MM-DD[&export=csv]

    The day's warehouse work per worker. The office and warehouse managers:
    it compares colleagues, which is a manager's view rather than something
    for the floor.
    """

    permission_classes = [IsStaffOrWarehouseManager]

    def get(self, request):
        try:
            day = report.parse_date(request.query_params.get("date", ""))
        except ValueError:
            raise ValidationError({"date": ["Use the form YYYY-MM-DD."]}) from None

        data = report.build(day)
        if request.query_params.get("export") == "csv":
            response = HttpResponse(report.to_csv(data), content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = f'attachment; filename="warehouse-report-{data["date"]}.csv"'
            return response
        return Response(data)


def stream_photo(photo):
    """Send one stored photo (damage or package) to the browser.

    The content type is the one sniffed at upload, never the uploader's; a
    row whose file has gone missing is a 404, not a 500. Private caching: the
    photo is only for the people allowed to ask for it.
    """
    try:
        handle = photo.image.open("rb")
    except FileNotFoundError as error:
        raise Http404("This photo is missing.") from error
    response = FileResponse(handle, content_type=photo.content_type)
    response["Cache-Control"] = "private, max-age=3600"
    return response


class PackagePhotoSerializer(serializers.ModelSerializer):
    """A package photo as the warehouse lists it."""

    url = serializers.SerializerMethodField()
    taken_by = serializers.SerializerMethodField()

    class Meta:
        model = PackagePhoto
        fields = ["id", "url", "uploaded_at", "taken_by"]
        read_only_fields = fields

    def get_url(self, obj):
        return f"/staff/warehouse/shipments/{obj.package_id}/photos/{obj.pk}/"

    def get_taken_by(self, obj):
        return person(obj.worker) if obj.worker else None
