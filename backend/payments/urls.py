from django.urls import path

from . import views

urlpatterns = [
    path("checkout/", views.CheckoutView.as_view(), name="payment-checkout"),
    path("webhook/", views.webhook, name="payment-webhook"),
]
