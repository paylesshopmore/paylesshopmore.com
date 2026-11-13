"""Login activity in Django's own admin.

* The log itself is READ-ONLY here: a security record that can be tidied up
  afterwards proves nothing. (Old rows leave through the retention command,
  not through the admin.)
* The thresholds (SecuritySettings) are edited here - this is where the office
  sets "how many failed tries are too many".
* The block list (BlockedIP) is edited here.
"""

from django.contrib import admin

from .models import BlockedIP, LoginActivity, SecuritySettings


@admin.register(LoginActivity)
class LoginActivityAdmin(admin.ModelAdmin):
    list_display = ("created_at", "identifier", "ip_address", "country", "city", "status", "security_status")
    list_filter = ("status", "security_status", "country")
    search_fields = ("identifier", "ip_address")
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SecuritySettings)
class SecuritySettingsAdmin(admin.ModelAdmin):
    # One row only: nothing to add or delete, just change the numbers.
    def has_add_permission(self, request):
        return not SecuritySettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(BlockedIP)
class BlockedIPAdmin(admin.ModelAdmin):
    list_display = ("ip_address", "reason", "created_at", "created_by")
    search_fields = ("ip_address", "reason")

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
