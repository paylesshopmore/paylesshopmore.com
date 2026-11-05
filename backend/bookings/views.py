"""The public booking endpoint. The staff half lives in staff/views.py."""

import json
import logging

from django.db import transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from config import abuse
from tracking.models import Carrier, CarrierShipment
from tracking.normalize import InvalidTrackingNumber, normalize_tracking_number
from tracking.sync import register_now, start_tracking

from .models import Booking, BookingAttachment, BookingOrder, BookingProduct
from .serializers import (
    BookingSerializer,
    MyBookingSerializer,
    MyOrderSerializer,
    OrderInputSerializer,
    contents_from,
    validate_attachment,
)

logger = logging.getLogger(__name__)


def attachment_response(attachment):
    """Stream one attachment, shown in the browser (so a screenshot can be
    looked at straight away) under the name the customer gave it.

    The content type is the one recorded at upload from the checked
    extension, not anything the browser claimed. A row whose file has gone
    missing is a 404 rather than a 500."""
    try:
        handle = attachment.file.open("rb")
    except FileNotFoundError as error:
        raise Http404("This file is missing.") from error
    return FileResponse(
        handle,
        as_attachment=not attachment.is_image,
        filename=attachment.original_name or "attachment",
        content_type=attachment.content_type,
    )


def _tell_the_office(booking_id):
    """E-mail the office about a new booking, once it is saved.

    Queued on commit, so the mail never describes a booking that was rolled
    back. A failure to queue is logged and swallowed: the booking is saved and
    on the dashboard either way - only the e-mail about it is missing."""

    def send():
        from .tasks import send_new_booking_email

        try:
            send_new_booking_email.delay(booking_id)
        except Exception:
            logger.exception(
                "Booking %s was saved but the office e-mail could not be queued.", booking_id
            )

    transaction.on_commit(send)


class BookingCreateView(generics.CreateAPIView):
    """POST only. Nothing reads bookings back out here — staff read them in
    the dashboard, and a customer reads their own through MyBookingListView,
    so a bug in this view cannot leak somebody's shipment.

    The stores the customer bought from arrive as `orders`: a list of
    {shop, shop_name, description} (see OrderInputSerializer). From those the
    booking's `contents` line is written, so customs still reads one line.

    JSON when there are no screenshots. With screenshots it is multipart:
    the fields as ordinary fields, `orders` as a JSON string, and the
    screenshot for row N as the file `order_N_screenshot`."""

    queryset = Booking.objects.all()
    serializer_class = BookingSerializer
    permission_classes = [AllowAny]
    # The same scope as the contact and quote forms: generous for a real
    # customer, tight enough that the form is a poor spam target.
    throttle_scope = "forms"
    throttle_classes = [ScopedRateThrottle]

    def create(self, request, *args, **kwargs):
        # Site-wide ceiling as well as the per-IP throttle: see config/abuse.py.
        abuse.check("booking")
        orders = self._orders(request)

        # A changeable copy of the fields. For multipart, request.POST holds
        # the fields without the files: copying request.data would try to
        # copy every uploaded file too, which fails for a large one.
        if request.content_type.startswith("multipart/"):
            data = request.POST.copy()
        else:
            data = dict(request.data)
        if orders:
            # The stores and what was bought there, as the one line customs
            # reads. Replaces anything typed in `contents`.
            data["contents"] = contents_from(orders)
            data["contents_attached"] = False

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        # Every screenshot checked before anything is saved: a booking whose
        # screenshot was refused is sent again with it fixed, not left
        # half-stored.
        screenshots = {}
        for index in range(len(orders)):
            uploaded = request.FILES.get(f"order_{index}_screenshot")
            if uploaded is None:
                continue
            try:
                screenshots[index] = (uploaded, validate_attachment(uploaded))
            except ValidationError as error:
                raise ValidationError({"orders": {index: {"screenshot": error.detail}}}) from error

        # And a screenshot per product, as `order_N_product_M_screenshot`.
        product_shots = {}
        for index, order in enumerate(orders):
            for number in range(len(order["products"])):
                uploaded = request.FILES.get(f"order_{index}_product_{number}_screenshot")
                if uploaded is None:
                    continue
                try:
                    product_shots[index, number] = (uploaded, validate_attachment(uploaded))
                except ValidationError as error:
                    raise ValidationError(
                        {"orders": {index: {"products": {number: {"screenshot": error.detail}}}}}
                    ) from error

        # Attached when the sender happens to be signed in, so the booking
        # turns up against their account. The form does not require one.
        user = request.user if request.user.is_authenticated else None

        with transaction.atomic():
            booking = serializer.save(user=user)
            for index, order in enumerate(orders):
                row = BookingOrder.objects.create(
                    booking=booking,
                    shop=order.get("shop"),
                    shop_name=order["shop_name"],
                    description=order["description"],
                    position=index,
                )
                if index in screenshots:
                    uploaded, content_type = screenshots[index]
                    BookingAttachment.objects.create(
                        booking=booking,
                        order=row,
                        file=uploaded,
                        original_name=(uploaded.name or "")[:255],
                        content_type=content_type,
                        size_bytes=uploaded.size,
                    )
                for number, product in enumerate(order["products"]):
                    shot = None
                    if (index, number) in product_shots:
                        uploaded, content_type = product_shots[index, number]
                        shot = BookingAttachment.objects.create(
                            booking=booking,
                            order=row,
                            kind=BookingAttachment.Kind.PRODUCT,
                            file=uploaded,
                            original_name=(uploaded.name or "")[:255],
                            content_type=content_type,
                            size_bytes=uploaded.size,
                        )
                    BookingProduct.objects.create(
                        booking=booking,
                        order=row,
                        description=product["description"],
                        url=product.get("url", ""),
                        customer_price_eur=product.get("customer_price_eur"),
                        quantity=product.get("quantity") or 1,
                        screenshot=shot,
                        position=number,
                    )

        abuse.record("booking")
        _tell_the_office(booking.pk)

        # Only the reference is echoed back — enough for the confirmation
        # screen, and nothing the sender did not already type.
        return Response(
            {"id": booking.pk, "created_at": booking.created_at},
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _orders(request):
        """The checked store rows, or [] when the form sent none (an older
        client that still types `contents` itself)."""
        raw = request.data.get("orders")
        if raw in (None, ""):
            return []
        # Multipart carries the list as one JSON string.
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except ValueError as error:
                raise ValidationError({"orders": "Could not read the stores."}) from error
        if not isinstance(raw, list) or not raw:
            raise ValidationError({"orders": "Add at least one store."})
        if len(raw) > BookingOrder.MAX_ORDERS:
            raise ValidationError(
                {"orders": f"At most {BookingOrder.MAX_ORDERS} stores can be added."}
            )
        rows = OrderInputSerializer(data=raw, many=True)
        if not rows.is_valid():
            raise ValidationError({"orders": rows.errors})
        return rows.validated_data


class MyBookingListView(generics.ListAPIView):
    """GET: the signed-in customer's own bookings, newest first ("Mijn
    boekingen" on the profile page).

    Only ever filtered by the person asking - there is no id in the address
    to change, so one customer cannot read another's bookings. Bookings sent
    without being signed in have no account attached and do not show here.

    A booking the office has confirmed is left out too: confirming it made
    it a shipment (see bookings/shipments.py), and from then on the customer
    follows it under "My shipments" instead. Nothing is deleted - the booking
    stays in the database and on the staff dashboard.

    The test is "has a shipment", not "status is Confirmed", so a booking
    confirmed before bookings became shipments - which has no shipment and so
    nowhere else to be seen - stays here."""

    serializer_class = MyBookingSerializer
    permission_classes = [IsAuthenticated]
    # A customer has a handful of bookings, not thousands: no paging.
    pagination_class = None

    def get_queryset(self):
        return (
            Booking.objects.filter(user=self.request.user)
            .filter(package__isnull=True)
            .prefetch_related(
                "orders__screenshots",
                "orders__products__screenshot",
                "orders__carrier_shipments__carrier",
                "orders__carrier_shipments__events",
            )
            .order_by("-created_at")
        )


# A booking that has left, or was cancelled, is a record: nothing more is
# added to it or taken away from it by the customer.
DOCUMENTS_CLOSED = (Booking.Status.SHIPPED, Booking.Status.CANCELLED)


def _refuse_if_closed(booking):
    if booking.status in DOCUMENTS_CLOSED:
        raise PermissionDenied(
            "This booking has been shipped or cancelled; documents can no longer be changed."
        )


class MyBookingAttachmentView(APIView):
    """GET one file from the signed-in customer's own booking; DELETE one of
    the documents they added to it afterwards.

    Looked up through the booking's owner, so somebody else's file - or a
    file id that does not belong to this booking - is a 404, the same answer
    as one that does not exist. The screenshot sent with the booking form
    cannot be deleted here: that is what the office booked in from."""

    permission_classes = [IsAuthenticated]

    def _attachment(self, request, booking_id, attachment_id):
        return get_object_or_404(
            BookingAttachment,
            pk=attachment_id,
            booking_id=booking_id,
            booking__user=request.user,
        )

    def get(self, request, booking_id, attachment_id):
        return attachment_response(self._attachment(request, booking_id, attachment_id))

    def delete(self, request, booking_id, attachment_id):
        attachment = self._attachment(request, booking_id, attachment_id)
        if attachment.kind in BookingAttachment.FORM_KINDS:
            raise PermissionDenied("The screenshot sent with the booking cannot be removed.")
        _refuse_if_closed(attachment.booking)
        attachment.file.delete(save=False)
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyOrderTrackingView(APIView):
    """PATCH {"tracking_code": "...", "carrier": "postnl"}: set or clear the
    track-and-trace of one store row on the signed-in customer's own booking -
    a code or the carrier's link, typed rather than uploaded - and which
    courier delivers it. Until the booking is shipped or cancelled. Answers
    with the store row as it now reads.

    With a courier chosen, the number is also followed automatically
    (tracking app): see _follow_courier below."""

    permission_classes = [IsAuthenticated]
    throttle_scope = "booking_documents"
    throttle_classes = [ScopedRateThrottle]

    MAX_LENGTH = BookingOrder._meta.get_field("tracking_code").max_length

    def patch(self, request, booking_id, order_id):
        order = get_object_or_404(
            BookingOrder.objects.select_related("booking"),
            pk=order_id,
            booking_id=booking_id,
            booking__user=request.user,
        )
        _refuse_if_closed(order.booking)

        value = request.data.get("tracking_code")
        if not isinstance(value, str):
            raise ValidationError({"tracking_code": "Enter the track-and-trace code or link."})
        # One line: a pasted link with a newline after it is still one code.
        value = " ".join(value.split())
        if len(value) > self.MAX_LENGTH:
            raise ValidationError(
                {"tracking_code": f"At most {self.MAX_LENGTH} characters."}
            )

        carrier = _carrier_from(request.data.get("carrier"))

        with transaction.atomic():
            order.tracking_code = value
            order.save(update_fields=["tracking_code"])
            shipment = _follow_courier(order, value, carrier)

        if shipment is not None and shipment.provider:
            # Ask the courier straight away, so the first update is usually
            # there when the page reloads. Never raises.
            register_now(shipment)

        order = BookingOrder.objects.prefetch_related(
            "screenshots", "carrier_shipments__carrier", "carrier_shipments__events",
            "products__screenshot",
        ).get(pk=order.pk)
        return Response(MyOrderSerializer(order).data)


def _carrier_from(code):
    """The Carrier for a code from the "Courier company" list; None for none."""
    if code in (None, ""):
        return None
    carrier = Carrier.objects.filter(code=str(code), is_active=True).first()
    if carrier is None:
        raise ValidationError({"carrier": "Choose a courier from the list."})
    return carrier


def _follow_courier(order, tracking_code, carrier):
    """Create, replace or remove the order's CarrierShipment. Returns it or None.

    - No code, or no courier chosen: nothing to follow (any old one is removed).
    - The same courier and number as before: kept as it is, with its history.
    - Anything else: started fresh - a new number has a history of its own.

    Only the number the customer entered themselves is touched here. An order
    can have more parcels; numbers our staff registered on it (Dashboard ->
    Courier tracking) are never changed or removed by the customer.
    """
    existing = next((s for s in order.carrier_shipments.all() if s.entered_by_customer), None)
    if not tracking_code or carrier is None:
        if existing is not None:
            existing.delete()
        return None

    try:
        number = normalize_tracking_number(tracking_code)
    except InvalidTrackingNumber as error:
        raise ValidationError({"tracking_code": str(error)}) from None

    if existing is not None and existing.tracking_number == number and existing.carrier_id == carrier.pk:
        return existing
    if existing is not None:
        existing.delete()

    shipment = CarrierShipment.objects.create(
        order=order,
        owner=order.booking.user,
        entered_by=order.booking.user,
        carrier=carrier,
        tracking_number=number,
    )
    start_tracking(shipment)
    return shipment


class MyOrderDocumentView(APIView):
    """POST (multipart: `file`, `kind`): add a document to one store row of
    the signed-in customer's own booking, after the booking was sent - the
    order confirmation, the invoice, the track-and-trace.

    The same file checks as the booking form's screenshot. Until the booking
    is shipped or cancelled. Answers with the store row as it now reads."""

    permission_classes = [IsAuthenticated]
    throttle_scope = "booking_documents"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request, booking_id, order_id):
        order = get_object_or_404(
            BookingOrder.objects.select_related("booking"),
            pk=order_id,
            booking_id=booking_id,
            booking__user=request.user,
        )
        _refuse_if_closed(order.booking)

        kind = request.data.get("kind")
        if kind not in BookingAttachment.DOCUMENT_KINDS:
            raise ValidationError({"kind": "Choose what kind of document this is."})

        uploaded = request.FILES.get("file")
        if uploaded is None:
            raise ValidationError({"file": "Choose a file to add."})
        content_type = validate_attachment(uploaded)

        documents = order.screenshots.exclude(kind__in=BookingAttachment.FORM_KINDS)
        if documents.count() >= BookingAttachment.MAX_DOCUMENTS_PER_ORDER:
            raise ValidationError(
                {
                    "file": f"At most {BookingAttachment.MAX_DOCUMENTS_PER_ORDER} documents "
                    "can be added to one store."
                }
            )

        attachment = BookingAttachment.objects.create(
            booking=order.booking,
            order=order,
            kind=kind,
            file=uploaded,
            original_name=(uploaded.name or "")[:255],
            content_type=content_type,
            size_bytes=uploaded.size,
        )
        # Read it with AI and match it (docreview/). Does nothing unless
        # automatic document reading is switched on.
        from docreview.pipeline import job_for_booking_attachment

        job_for_booking_attachment(attachment)

        order = BookingOrder.objects.prefetch_related("screenshots").get(pk=order.pk)
        return Response(MyOrderSerializer(order).data, status=status.HTTP_201_CREATED)
