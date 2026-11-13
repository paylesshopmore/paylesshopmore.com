"""Public booking route, mounted under /api/ by config/urls.py."""

from django.urls import path

from . import views

urlpatterns = [
    path("bookings/", views.BookingCreateView.as_view(), name="booking-create"),
    # The signed-in customer's own bookings, for their profile page.
    path("bookings/mine/", views.MyBookingListView.as_view(), name="my-bookings"),
    # One screenshot or photo from one of the customer's own bookings.
    path(
        "bookings/mine/<int:booking_id>/attachments/<int:attachment_id>/",
        views.MyBookingAttachmentView.as_view(),
        name="my-booking-attachment",
    ),
    # Add a document (order confirmation, invoice, track-and-trace) to one
    # store row of the customer's own booking, after it was sent.
    # The same store row's track-and-trace, typed as text.
    path(
        "bookings/mine/<int:booking_id>/orders/<int:order_id>/tracking/",
        views.MyOrderTrackingView.as_view(),
        name="my-order-tracking",
    ),
    # The webshop's own order number for the same store row (optional).
    path(
        "bookings/mine/<int:booking_id>/orders/<int:order_id>/order-number/",
        views.MyOrderNumberView.as_view(),
        name="my-order-number",
    ),
    path(
        "bookings/mine/<int:booking_id>/orders/<int:order_id>/documents/",
        views.MyOrderDocumentView.as_view(),
        name="my-order-documents",
    ),
]
