"""Intake sheets in Django's own admin.

The dashboard is where these are written; this is for the cases the dashboard
deliberately will not do - reading a sheet whose reference somebody has
forgotten, or looking at `emailed_at` to see whether a handover mail ever
actually left.

Released sheets are read-only here too. The rule that a handover is evidence
rather than a form does not stop applying because the URL changed.
"""

from django.contrib import admin

from .models import (
    IntakeDeletion,
    IntakeNumber,
    IntakeSheet,
    Measurement,
    PackageActivity,
    PackageDamagePhoto,
    PackageDamageReport,
    PackageMeasurement,
    PackagePackaging,
)


class ReadOnlyAdmin(admin.ModelAdmin):
    """Warehouse records are written by the warehouse API and never edited."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PackageActivity)
class PackageActivityAdmin(ReadOnlyAdmin):
    list_display = ("timestamp", "package", "action", "user", "description")
    list_filter = ("action", "timestamp")
    search_fields = ("package__tracking_number", "user__email", "description")
    list_select_related = ("package", "user")
    date_hierarchy = "timestamp"


@admin.register(PackageMeasurement)
class PackageMeasurementAdmin(ReadOnlyAdmin):
    list_display = (
        "measured_at", "package", "weight_kg", "length_cm", "width_cm", "height_cm",
        "volume_m3", "dimensional_weight_kg", "worker",
    )
    search_fields = ("package__tracking_number", "worker__email")
    list_select_related = ("package", "worker")
    date_hierarchy = "measured_at"


@admin.register(PackagePackaging)
class PackagePackagingAdmin(ReadOnlyAdmin):
    list_display = ("created_at", "package", "packaging_type", "quantity", "worker")
    list_filter = ("packaging_type",)
    search_fields = ("package__tracking_number", "worker__email")
    list_select_related = ("package", "worker")


class PackageDamagePhotoInline(admin.TabularInline):
    model = PackageDamagePhoto
    extra = 0
    fields = ("content_type", "size_bytes", "uploaded_at")
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(PackageDamageReport)
class PackageDamageReportAdmin(ReadOnlyAdmin):
    inlines = [PackageDamagePhotoInline]
    list_display = ("created_at", "package", "damage_type", "resolution_status", "worker")
    list_filter = ("damage_type", "resolution_status")
    search_fields = ("package__tracking_number", "description")
    list_select_related = ("package", "worker")


class MeasurementInline(admin.TabularInline):
    model = Measurement
    extra = 0
    fields = (
        "quantity",
        "packaging",
        "length_cm",
        "width_cm",
        "height_cm",
        "weight_kg",
        "note",
    )

    # Locked with the sheet they belong to, for the same reason.
    def has_change_permission(self, request, obj=None):
        if obj is not None and obj.released:
            return False
        return super().has_change_permission(request, obj)

    has_add_permission = has_change_permission
    has_delete_permission = has_change_permission


@admin.register(IntakeSheet)
class IntakeSheetAdmin(admin.ModelAdmin):
    inlines = [MeasurementInline]

    list_display = (
        "number",
        "label",
        "status",
        "destination",
        "colli_count",
        "received_on",
        "released_at",
        "emailed_at",
    )
    list_filter = ("status", "freight", "damage_present")
    search_fields = ("reference", "supplier", "sender", "recipient", "destination")
    date_hierarchy = "created_at"

    readonly_fields = (
        "number",
        "status",
        "archived_at",
        "archived_by",
        "created_by",
        "released_by",
        "released_at",
        "emailed_at",
        "created_at",
        "updated_at",
    )

    def has_change_permission(self, request, obj=None):
        if obj is not None and obj.released:
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        # Deleting goes through the warehouse's own "Delete" (empty sheets
        # only, recorded, number freed) - never through here.
        return False


# The intake number register and the deletions: to read, never to edit.
@admin.register(IntakeNumber)
class IntakeNumberAdmin(ReadOnlyAdmin):
    list_display = ("number", "state", "sheet", "times_used", "released_at", "released_by")
    list_filter = ("state",)


@admin.register(IntakeDeletion)
class IntakeDeletionAdmin(ReadOnlyAdmin):
    list_display = ("number", "sheet_id_was", "reference", "created_by", "deleted_by", "deleted_at")
