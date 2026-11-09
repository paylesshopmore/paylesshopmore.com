"""Pre-alert endpoints.

FOR THE CUSTOMER (signed in; only ever their own pre-alerts)
  GET  /api/prealerts/                     list, newest first
  POST /api/prealerts/                     send the form (multipart: fields + `documents` files)
  GET  /api/prealerts/<id>/                one
  POST /api/prealerts/<id>/cancel/         withdraw it, while the parcel is not with us yet
  GET  /api/prealerts/<id>/documents/<d>/  download one invoice file

FOR THE OFFICE (and the warehouse manager, read-only)
  GET  /api/staff/prealerts/               list; ?search= ?status=
  GET  /api/staff/prealerts/<id>/          one
  POST /api/staff/prealerts/<id>/add-to-shipment/  {package: "PLSM-00042"} (office)
  POST /api/staff/prealerts/<id>/cancel/   (office)
  GET  /api/staff/prealerts/<id>/documents/<d>/   download

The floor's part (scanning the courier barcode, confirming arrival) is the
warehouse scanner: tracking/matching.py finds a pre-alert's parcel exactly as
it finds a booking order's.
"""

import logging

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from accounts.models import Package
from staff.permissions import IsStaff, IsStaffOrWarehouseManager
from tracking.models import CarrierShipment
from tracking.sync import register_now, start_tracking

from .models import PreAlert, PreAlertDocument
from .serializers import (
    CustomerPreAlertSerializer,
    PreAlertInputSerializer,
    StaffPreAlertSerializer,
    validate_documents,
)

logger = logging.getLogger("prealerts.audit")

# Said for every duplicate, whoever's it is: it does not tell a stranger
# whose number it is, only that it is taken.
DUPLICATE = (
    "This tracking number is already registered with us. If it is your parcel "
    "and you cannot find it in your account, contact us."
)


def _document_response(prealert, document_id):
    document = get_object_or_404(prealert.documents, pk=document_id)
    try:
        handle = document.file.open("rb")
    except FileNotFoundError as error:
        raise Http404("This file is missing.") from error
    # A PDF is downloaded rather than opened in a tab here, and an image is
    # shown; the type is the one recorded from the checked contents.
    return FileResponse(
        handle,
        as_attachment=document.content_type == "application/pdf",
        filename=str(document),
        content_type=document.content_type,
    )


def create_prealert(user, data, files):
    """Save a checked form, its files and its courier tracking, all or nothing.

    Raises ValidationError(DUPLICATE) when the number is already registered -
    as a live pre-alert, or on a booking order - so the warehouse never has
    two candidates for one parcel. The database constraint backs this up for
    two forms sent at the same instant (a double-click).
    """
    number = data["tracking_number"]
    taken = PreAlert.objects.filter(tracking_number=number).exclude(
        status=PreAlert.Status.CANCELLED
    ).exists() or CarrierShipment.objects.filter(tracking_number=number).exists()
    if taken:
        raise ValidationError({"tracking_number": DUPLICATE})

    try:
        with transaction.atomic():
            prealert = PreAlert.objects.create(
                user=user,
                carrier=data["carrier"],
                tracking_number=number,
                shop=data.get("shop"),
                shop_name=data["shop_name"],
                description=data["description"],
                consignee_name=data["consignee_name"],
                consignee_address=data["consignee_address"],
                consignee_address_text=data["consignee_address_text"],
                declared_value=data.get("declared_value"),
                currency=data["currency"],
                restricted_items_confirmed_at=timezone.now(),
            )
            for uploaded, content_type in files:
                PreAlertDocument.objects.create(
                    prealert=prealert,
                    file=uploaded,
                    original_name=(uploaded.name or "")[:255],
                    content_type=content_type,
                    size_bytes=uploaded.size,
                )
            # Follow the courier like any booking order's parcel (tracking app).
            shipment = CarrierShipment.objects.create(
                prealert=prealert, owner=user, entered_by=user, carrier=data["carrier"], tracking_number=number
            )
            start_tracking(shipment)
            notify_submitted(prealert)
    except IntegrityError:
        # The same number saved a moment ago by another request.
        raise ValidationError({"tracking_number": DUPLICATE}) from None

    logger.info("User %s sent pre-alert %s.", user.pk, prealert.reference)
    return prealert, shipment


def notify_submitted(prealert):
    """"Your pre-alert is registered": in the bell, and by e-mail if allowed.

    Called once, inside the transaction that saves the pre-alert, so a form
    that fails to save never announces itself and a retried one that is
    refused as a duplicate never announces itself twice.
    """
    from notifications.models import Notification
    from notifications.services import _queue_email

    notification = Notification.objects.create(
        user=prealert.user,
        kind=Notification.Kind.SHIPMENT_STATUS,
        context={
            "tracking_number": prealert.reference,
            "status": "prealert_submitted",
            "shop": prealert.shop_name,
        },
    )
    _queue_email(notification)


class PreAlertViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """The signed-in customer's own pre-alerts."""

    serializer_class = CustomerPreAlertSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Narrowed to the caller before any id from the URL is looked at, so
        # somebody else's pre-alert is a 404, never a "not yours".
        return (
            PreAlert.objects.filter(user=self.request.user)
            .select_related("carrier", "package")
            .prefetch_related("documents", "carrier_shipment__carrier", "carrier_shipment__events")
        )

    def get_throttles(self):
        if self.action == "create":
            self.throttle_scope = "prealerts"
            return [ScopedRateThrottle()]
        if self.action == "read":
            # Each one is a paid OpenAI call.
            self.throttle_scope = "prealert_read"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    @action(detail=False, methods=["post"])
    def read(self, request):
        """POST one file (multipart "file"): the form's fields, read from it by AI.

        A screenshot or PDF of the order confirmation or shipping e-mail.
        Answers {"tracking_number", "carrier", "shop", "shop_name",
        "description"} for the page to fill in - nothing is saved. 503 when
        the AI is not set up or could not read it. See prealerts/reading.py.
        """
        from docreview.ai import ExtractionError

        from .reading import read_order

        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "Choose a screenshot or PDF."})
        # The same types and size as the pre-alert's own documents. The type
        # is the one read from the file itself, not what the browser claimed.
        [(upload, content_type)] = validate_documents([upload])
        upload.seek(0)

        try:
            fields = read_order(upload.read(), content_type)
        except ExtractionError:
            logging.getLogger("prealerts.reading").exception("Reading a pre-alert screenshot failed")
            return Response(
                {"detail": "The screenshot could not be read just now. Please fill in the form yourself."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(fields)

    def create(self, request):
        form = PreAlertInputSerializer(data=request.data, context={"request": request})
        form.is_valid(raise_exception=True)
        files = validate_documents(request.FILES.getlist("documents"))

        prealert, shipment = create_prealert(request.user, form.validated_data, files)
        if shipment.provider:
            # Ask the courier straight away; never fails the form.
            register_now(shipment)
        return Response(self.get_serializer(self.get_queryset().get(pk=prealert.pk)).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        prealert = self.get_object()
        if not prealert.can_cancel:
            raise ValidationError({"detail": "This parcel is already at our warehouse; contact us to change it."})
        prealert.status = PreAlert.Status.CANCELLED
        prealert.save(update_fields=["status", "updated_at"])
        # Nothing left to follow.
        CarrierShipment.objects.filter(prealert=prealert).update(next_sync_at=None)
        logger.info("User %s cancelled pre-alert %s.", request.user.pk, prealert.reference)
        return Response(self.get_serializer(prealert).data)

    @action(detail=True, methods=["get"], url_path=r"documents/(?P<document_id>\d+)")
    def document(self, request, pk=None, document_id=None):
        return _document_response(self.get_object(), document_id)


class StaffPreAlertViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Every customer's pre-alerts, for the office and the warehouse manager."""

    serializer_class = StaffPreAlertSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve", "document"):
            return [IsStaffOrWarehouseManager()]
        return [IsStaff()]

    def get_serializer_context(self):
        return super().get_serializer_context() | {"document_route": "staff-prealert-document"}

    def get_queryset(self):
        queryset = PreAlert.objects.select_related("carrier", "package", "user", "arrived_by").prefetch_related(
            "documents", "carrier_shipment__carrier", "carrier_shipment__events"
        )
        params = self.request.query_params
        search = params.get("search", "").strip()
        if search:
            compact = search.replace(" ", "").upper()
            queryset = queryset.filter(
                Q(reference__icontains=search)
                | Q(tracking_number__icontains=compact)
                | Q(shop_name__icontains=search)
                | Q(description__icontains=search)
                | Q(user__email__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(package__tracking_number__icontains=search)
            )
        wanted = params.get("status", "").strip()
        if wanted in PreAlert.Status.values:
            queryset = queryset.filter(status=wanted)
        return queryset

    @action(detail=True, methods=["post"], url_path="add-to-shipment")
    def add_to_shipment(self, request, pk=None):
        """Put the parcel in one of OUR shipments: {package: "PLSM-00042"}.

        Only a shipment of the same customer: a parcel never moves to somebody
        else's shipment by a typo.
        """
        prealert = self.get_object()
        number = str(request.data.get("package") or "").strip()
        package = Package.objects.filter(tracking_number__iexact=number, user_id=prealert.user_id).first()
        if package is None:
            raise ValidationError({"package": "No shipment of this customer has that number."})
        prealert.package = package
        prealert.status = PreAlert.Status.IN_SHIPMENT
        prealert.save(update_fields=["package", "status", "updated_at"])
        logger.info(
            "User %s added pre-alert %s to shipment %s.", request.user.pk, prealert.reference, package.tracking_number
        )
        return Response(self.get_serializer(prealert).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        prealert = self.get_object()
        prealert.status = PreAlert.Status.CANCELLED
        prealert.save(update_fields=["status", "updated_at"])
        CarrierShipment.objects.filter(prealert=prealert).update(next_sync_at=None)
        logger.info("User %s cancelled pre-alert %s for the customer.", request.user.pk, prealert.reference)
        return Response(self.get_serializer(prealert).data)

    @action(detail=True, methods=["get"], url_path=r"documents/(?P<document_id>\d+)")
    def document(self, request, pk=None, document_id=None):
        return _document_response(self.get_object(), document_id)
