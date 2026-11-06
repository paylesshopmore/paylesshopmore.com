"""Admin registration, so the tables are usable without writing views yet."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import (
    Address,
    DeliveryConfirmation,
    FloorDevice,
    FloorEvent,
    Package,
    PackageEvent,
    SiteSettings,
    User,
    WarehousePin,
    WarehouseSignInCode,
)


@admin.register(DeliveryConfirmation)
class DeliveryConfirmationAdmin(admin.ModelAdmin):
    """Proof of delivery, read-only: written once by the driver's app."""

    list_display = ("delivered_at", "package", "recipient_name", "driver")
    search_fields = ("package__tracking_number", "recipient_name", "driver__email")
    list_select_related = ("package", "driver")
    date_hierarchy = "delivered_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(WarehouseSignInCode)
class WarehouseSignInCodeAdmin(admin.ModelAdmin):
    """Who was sent a warehouse sign-in code, by whom, and whether it was used.

    Read-only: a code is made by the dashboard's Send code button and spent by
    the worker, and nobody should be hand-editing either. The digest is left
    off the page - it is not the code, but there is no reason to show it.
    """

    list_display = (
        "created_at",
        "worker",
        "sent_by",
        "shown_on_screen",
        "expires_at",
        "used_at",
        "attempts",
    )
    list_filter = ("used_at", "shown_on_screen")
    search_fields = ("user__email", "issued_by__email")
    list_select_related = ("user", "issued_by")
    date_hierarchy = "created_at"
    exclude = ("code_hash",)

    # E-mail addresses rather than str(user), which is just a first name: an
    # audit trail that says "Wim sent a code to Wim" is no use when two people
    # share a name, and the address is also what the admin typed to send it.
    @admin.display(description="Worker", ordering="user__email")
    def worker(self, obj):
        return obj.user.email

    @admin.display(description="Sent by", ordering="issued_by__email")
    def sent_by(self, obj):
        return obj.issued_by.email if obj.issued_by_id else "—"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


class AddressInline(admin.TabularInline):
    """Edit a customer's addresses on the customer page itself."""

    model = Address
    extra = 0


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Extends Django's UserAdmin so password hashing and the permission
    widgets keep working; a plain ModelAdmin would store passwords in clear
    text through the form.
    """

    inlines = [AddressInline]
    list_display = ("username", "first_name", "last_name", "email", "role")
    list_filter = BaseUserAdmin.list_filter + ("role",)
    search_fields = ("username", "first_name", "last_name", "email", "phone_number")

    # Add the custom fields to the stock fieldsets rather than replacing them.
    # The role sets is_staff and is_warehouse (User.save), so it is the field
    # to change here; the flags are shown read-only for what they now say.
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Contact", {"fields": ("phone_number",)}),
        ("Role", {"fields": ("role", "is_warehouse")}),
    )
    readonly_fields = ("is_warehouse",)
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("Contact", {"fields": ("email", "phone_number")}),
    )


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ("street", "house_number", "city", "country", "user", "is_default")
    list_filter = ("country", "is_default")
    search_fields = ("street", "city", "postal_code", "user__username")


@admin.register(Package)
class PackageAdmin(admin.ModelAdmin):
    list_display = ("tracking_number", "user", "status", "locked", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("tracking_number", "user__username", "user__email")
    # A plain select would load every address in the database into the page.
    autocomplete_fields = ("user", "delivery_address")
    date_hierarchy = "created_at"

    @admin.display(boolean=True, description="Locked")
    def locked(self, package):
        return package.locked

    def get_readonly_fields(self, request, obj=None):
        """Grey out what a shipment that has left no longer gets to change.

        Package.save() refuses these anyway, so without this the admin offers
        a form that can only end in an error page. The fields are the model's
        own list rather than a second copy of it, so a column added to
        FROZEN_FIELDS later is greyed out here without anybody remembering to
        come back.

        Not a security boundary — an admin user with a shell can call save()
        with force_unlock=True, which is the deliberate way to repair a record
        and reads as exactly that at the call site.
        """
        readonly = super().get_readonly_fields(request, obj)
        if obj is not None and obj.locked:
            return tuple(readonly) + Package.FROZEN_FIELDS + ("status",)
        return readonly


@admin.register(PackageEvent)
class PackageEventAdmin(admin.ModelAdmin):
    """The order history, read-only — which is the whole point of it.

    Every permission below is closed. An append-only log with an edit form in
    front of it is not an audit trail, it is a note somebody can change after
    being asked about it, and the model's own save() refuses updates anyway.
    This makes the admin agree rather than offer a form that would only fail.

    It is registered mainly so the review history is reachable at all: "who
    rejected this invoice and what did they say" is now answerable, and until
    there is a screen for it this is the screen.
    """

    list_display = ("at", "tracking_number", "kind", "actor", "summary")
    list_filter = ("kind", "at")
    search_fields = (
        "package__tracking_number",
        "package__user__email",
        "actor__email",
    )
    list_select_related = ("package", "actor")
    date_hierarchy = "at"
    ordering = ("-at", "-id")

    def has_add_permission(self, request):
        # Events are recorded by record_event at the point the thing happened,
        # never typed in afterwards.
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="tracking number", ordering="package__tracking_number")
    def tracking_number(self, obj):
        return obj.package.tracking_number

    @admin.display(description="detail")
    def summary(self, obj):
        """The one fact that makes each kind worth reading, out of context."""
        context = obj.context or {}

        if obj.kind == PackageEvent.Kind.STATUS_CHANGED:
            before = context.get("from_status")
            after = context.get("to_status", "?")
            return f"{before} → {after}" if before else after

        if obj.kind == PackageEvent.Kind.INVOICE_REJECTED:
            return context.get("reason", "")

        if context.get("backfilled"):
            return "(backfilled)"

        return ""


@admin.register(FloorDevice)
class FloorDeviceAdmin(admin.ModelAdmin):
    """Floor devices. Registered from the dashboard, from the device itself,
    because that is where the token cookie has to be set; revoked there too."""

    list_display = ("name", "created_at", "created_by", "last_seen_at", "revoked_at")
    readonly_fields = ("token_hash", "created_at", "created_by", "last_seen_at", "revoked_by")
    list_select_related = ("created_by",)

    def has_add_permission(self, request):
        return False


@admin.register(WarehousePin)
class WarehousePinAdmin(admin.ModelAdmin):
    """Whose PIN is set and whose is locked. Never the PIN: only its hash, and
    not even that is shown."""

    list_display = ("user", "set_at", "failed_attempts", "locked_at")
    exclude = ("pin_hash",)
    readonly_fields = ("user", "set_at", "failed_attempts", "locked_at")
    list_select_related = ("user",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(FloorEvent)
class FloorEventAdmin(admin.ModelAdmin):
    """The audit trail: who signed in on which device, and PIN changes."""

    list_display = ("created_at", "kind", "user", "device", "actor")
    list_filter = ("kind", "device")
    search_fields = ("user__email", "user__first_name", "user__last_name")
    list_select_related = ("user", "device", "actor")
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    # The audit trail is only worth something if nobody can tidy it up
    # afterwards - not even an admin. The warehouse manager's activity log
    # (warehouse/manager.py) reads these rows.
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    """Switches for the public website. One row: it can be changed, not added
    to or deleted."""

    list_display = ("__str__", "show_stats_band", "show_calculator")
    fieldsets = (
        ("Website", {"fields": ("show_stats_band", "show_calculator")}),
        (
            "Company details on invoices",
            {
                "fields": (
                    "company_name",
                    "company_street",
                    "company_postcode_city",
                    "company_kvk",
                    "company_vat",
                    "company_iban",
                    "company_email",
                    "company_website",
                    "company_phone",
                ),
                "description": "Printed on every invoice drawn from now on.",
            },
        ),
    )

    def has_add_permission(self, request):
        return not SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
