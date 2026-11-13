"""The invoice settings page: numbering, VAT, insurance, wording, ports, charges.

Routed under /api/staff/ by staff/urls.py:

    GET  invoice-settings/          everything the editor needs to start
    PUT  invoice-settings/          change the settings          (admins only)
    ...  invoice-ports/             list / add / edit / delete    (writes: admins)
    ...  invoice-charge-types/      list / add / edit / delete    (writes: admins)

The rule is one line long: every member of staff may READ the configuration
(the editor cannot work without the list of ports), only an admin may CHANGE
it. Financial settings decide what customers are charged, so an office account
- or a stolen one - must not be able to change the VAT rate. That rule is
`ReadStaffWriteAdmin` below, checked by the server on every request; hiding
the buttons in the React app is only tidiness.
"""

import logging

from django.db import transaction
from rest_framework import serializers, viewsets
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import SiteSettings
from invoicing.models import ChargeType, InvoiceNumberSequence, InvoiceSettings, Port

logger = logging.getLogger(__name__)


class ReadStaffWriteAdmin(BasePermission):
    """GET for any active staff account; anything that changes data for admins."""

    message = "Only an admin can change the invoice settings."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_active and user.is_staff):
            return False
        return request.method in SAFE_METHODS or user.is_admin


class InvoiceSettingsSerializer(serializers.ModelSerializer):
    # Shows the admin what their numbering choice produces, e.g. PLSM20260012.
    next_number = serializers.SerializerMethodField()
    # The counter itself, as a plain number: 15 means the next invoice is
    # ...0015. An admin sets it to carry on from invoices written elsewhere.
    # (Not a column of InvoiceSettings: the counter is InvoiceNumberSequence,
    # so reading and writing it are handled by hand below.)
    next_sequence = serializers.IntegerField(required=False, min_value=1, max_value=99_999_999)

    class Meta:
        model = InvoiceSettings
        fields = [
            "number_prefix", "number_include_year", "number_digits", "next_number", "next_sequence",
            "standard_vat_rate", "export_vat_rate",
            "insurance_rate_percent", "insurance_minimum",
            *InvoiceSettings.TEXT_FIELDS,
        ]
        read_only_fields = ["next_number"]

    def get_next_number(self, obj):
        from django.utils import timezone

        return InvoiceNumberSequence.peek(timezone.localdate().year)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        from django.utils import timezone

        data["next_sequence"] = InvoiceNumberSequence.next_value(timezone.localdate().year)
        return data

    def update(self, instance, validated_data):
        """Save the settings, and move the counter when an admin set it.

        The counter is this year's (or the single one, when numbers carry no
        year). It is only touched when the value actually CHANGED, so saving
        the VAT rate never disturbs the numbering.
        """
        from django.utils import timezone

        wanted = validated_data.pop("next_sequence", None)
        instance = super().update(instance, validated_data)
        year = timezone.localdate().year
        if wanted is not None and wanted != InvoiceNumberSequence.next_value(year):
            before = InvoiceNumberSequence.next_value(year)
            InvoiceNumberSequence.set_next(year, wanted)
            logger.info(
                "Invoice counter changed from %s to %s by staff account %s.",
                before, wanted, self.context["request"].user.pk,
            )
        return instance

    def validate_number_prefix(self, value):
        # Letters, digits and dashes only: the number becomes a file name.
        if not value.replace("-", "").isalnum():
            raise serializers.ValidationError("Use only letters, digits and dashes.")
        return value


class CompanySerializer(serializers.ModelSerializer):
    """The company details printed on every invoice (KVK, BTW, IBAN, ...).

    They live on SiteSettings (accounts app) as company_name, company_kvk and
    so on. This serializer gives them the short names the dashboard uses
    (name, kvk, ...) through `source=`, so the page reads and writes the same
    keys it shows.

    Changes apply to invoices drawn from now on; a PDF already sent keeps the
    details it was drawn with.
    """

    name = serializers.CharField(source="company_name", max_length=100)
    street = serializers.CharField(source="company_street", max_length=100)
    postcode_city = serializers.CharField(source="company_postcode_city", max_length=100)
    kvk = serializers.CharField(source="company_kvk", max_length=20)
    vat = serializers.CharField(source="company_vat", max_length=20)
    iban = serializers.CharField(source="company_iban", max_length=34)
    email = serializers.EmailField(source="company_email")
    website = serializers.CharField(source="company_website", max_length=100)
    phone = serializers.CharField(source="company_phone", max_length=30, allow_blank=True)

    class Meta:
        model = SiteSettings
        fields = ["name", "street", "postcode_city", "kvk", "vat", "iban", "email", "website", "phone"]

    def validate_kvk(self, value):
        # A KVK number is digits only (8 for a Dutch company). Spaces are
        # removed; the length is not forced, so an older number still saves.
        value = value.replace(" ", "")
        if not value.isdigit():
            raise serializers.ValidationError("A KVK number contains only digits.")
        return value

    def validate_vat(self, value):
        # Written without spaces and in capitals: NL866317843B01.
        value = value.replace(" ", "").upper()
        if not value.isalnum():
            raise serializers.ValidationError("A BTW number contains only letters and digits.")
        return value

    def validate_iban(self, value):
        # Stored without spaces and in capitals: NL79INGB0115158162. Starts
        # with a two-letter country code and two check digits.
        value = value.replace(" ", "").upper()
        if not (
            len(value) >= 15 and value[:2].isalpha() and value[2:4].isdigit() and value.isalnum()
        ):
            raise serializers.ValidationError(
                "That does not look like an IBAN (e.g. NL79INGB0115158162)."
            )
        return value


class PortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Port
        fields = [
            "id", "name", "freight", "for_loading", "for_discharge",
            "destination_code", "is_default", "position", "active",
        ]


class ChargeTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChargeType
        fields = ["id", "name", "freight", "default_amount", "position", "active"]


class InvoiceSettingsView(APIView):
    """The settings row, plus the lists and the company details the editor needs.

    One request gives the editor everything it needs to start, so the form
    does not open with five spinners.
    """

    permission_classes = [ReadStaffWriteAdmin]

    def payload(self, request):
        return {
            "settings": InvoiceSettingsSerializer(InvoiceSettings.load()).data,
            "ports": PortSerializer(Port.objects.all(), many=True).data,
            "charge_types": ChargeTypeSerializer(ChargeType.objects.all(), many=True).data,
            "company": CompanySerializer(SiteSettings.load()).data,
            # What this user may do, so the page can hide what the server
            # would refuse anyway.
            "permissions": {
                "can_configure": request.user.is_admin,
                "can_adjust": request.user.is_admin,
                "can_delete": request.user.is_admin,
            },
        }

    def get(self, request):
        return Response(self.payload(request))

    def put(self, request):
        """Save the settings and, when sent as `company`, the company details.

        Both are checked before either is saved, so a mistake in the IBAN
        does not leave the VAT rate changed and the IBAN not.
        """
        data = dict(request.data)
        company_data = data.pop("company", None)

        body = InvoiceSettingsSerializer(
            InvoiceSettings.load(), data=data, partial=True, context={"request": request}
        )
        company = None
        if company_data is not None:
            company = CompanySerializer(SiteSettings.load(), data=company_data, partial=True)

        errors = {}
        if not body.is_valid():
            errors.update(body.errors)
        if company is not None and not company.is_valid():
            errors["company"] = company.errors
        if errors:
            raise serializers.ValidationError(errors)

        with transaction.atomic():
            body.save()
            if company is not None:
                company.save()
        return Response(self.payload(request))


class PortViewSet(viewsets.ModelViewSet):
    """Ports offered as Laadhaven / Loshaven. Not paginated: there are a handful."""

    serializer_class = PortSerializer
    permission_classes = [ReadStaffWriteAdmin]
    queryset = Port.objects.all()
    pagination_class = None


class ChargeTypeViewSet(viewsets.ModelViewSet):
    """Charges offered in the editor's list. Not paginated: there are a handful."""

    serializer_class = ChargeTypeSerializer
    permission_classes = [ReadStaffWriteAdmin]
    queryset = ChargeType.objects.all()
    pagination_class = None
