from django.contrib import admin

from .models import PaymentInvoice


@admin.register(PaymentInvoice)
class PaymentInvoiceAdmin(admin.ModelAdmin):
    list_display = ("number", "amount_display", "currency", "status", "created_at", "paid_at")
    search_fields = ("number",)
    list_filter = ("status",)
    # Set by the Stripe webhook, never by hand: a hand-edited "paid" with no
    # payment behind it is exactly the mistake these fields guard against.
    readonly_fields = ("created_at", "paid_at", "stripe_session_id")

    @admin.display(description="Amount", ordering="amount")
    def amount_display(self, obj):
        return f"{obj.amount / 100:.2f}"
