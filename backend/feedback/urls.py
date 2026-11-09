"""Customer-side feedback routes, mounted under /api/ by config/urls.py."""

from django.urls import path

from . import views

urlpatterns = [
    path("feedback/", views.SiteFeedbackView.as_view(), name="feedback"),
    path("feedback/deliveries/", views.DeliveryReviewView.as_view(), name="feedback-deliveries"),
]
