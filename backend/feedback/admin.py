from django.contrib import admin

from .models import Feedback


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ("created_at", "kind", "rating", "user", "email", "page", "package", "handled_at")
    list_filter = ("kind", "rating")
    search_fields = ("comment", "email", "user__email", "package__tracking_number")
    readonly_fields = ("created_at",)
