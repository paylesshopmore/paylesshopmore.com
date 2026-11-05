"""Django admin for bookings, for anything the dashboard does not cover."""

from django.contrib import admin

from .models import Booking, BookingAttachment, BookingOrder, BookingProduct


class BookingOrderInline(admin.TabularInline):
    """The stores the customer bought from, read-only."""

    model = BookingOrder
    extra = 0
    can_delete = False
    fields = ("position", "shop_name", "shop", "description")
    readonly_fields = fields


class BookingAttachmentInline(admin.TabularInline):
    """The customer's screenshots and photos, read-only: they are part of
    what was sent."""

    model = BookingAttachment
    extra = 0
    can_delete = False
    fields = ("order", "original_name", "content_type", "size_bytes", "created_at")
    readonly_fields = fields


class BookingProductInline(admin.TabularInline):
    """The products the customer listed. Their half is read-only; the
    office's price check is done on the dashboard."""

    model = BookingProduct
    extra = 0
    can_delete = False
    fields = (
        "order", "description", "url", "customer_price_eur", "quantity",
        "verified_price_eur", "verification_status", "staff_notes",
    )
    readonly_fields = ("order", "description", "url", "customer_price_eur", "quantity")


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    inlines = [BookingOrderInline, BookingProductInline, BookingAttachmentInline]
    list_display = (
        "shipping_number",
        "sender_name",
        "destination_label",
        "status",
        "created_at",
    )
    list_filter = ("status", "freight", "destination", "created_at")
    search_fields = (
        "shipping_number",
        "sender_first_name",
        "sender_last_name",
        "sender_email",
        "recipient_first_name",
        "recipient_last_name",
    )
    date_hierarchy = "created_at"

    # What the sender declared is a record of what they said, and the value is
    # what customs charges duty on. The office half is editable; their half is
    # not.
    readonly_fields = (
        "sender_first_name", "sender_last_name", "sender_address",
        "sender_postal_code", "sender_city", "sender_phone", "sender_email",
        "recipient_first_name", "recipient_last_name", "recipient_address",
        "recipient_city", "recipient_phone", "recipient_email",
        "recipient_crib_number", "freight", "destination", "destination_other", "packing", "payment",
        "quantity", "unit", "contents", "contents_attached", "value_eur",
        "vehicle", "emigration", "id_present", "deregistered",
        "deregistration_present", "insured", "insured_value_eur", "notes",
        "signature_name", "agreed_terms", "signed_at", "user", "language",
        "created_at", "updated_at",
    )
