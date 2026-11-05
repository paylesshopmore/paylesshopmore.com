"""Public pricing, for the shipping calculator: /api/pricing/handling/.

The calculator on the website works out its indication in the browser, so it
answers as the visitor types. The handling costs are not copied into the
website's code for that: the page asks this route for the rules once and
applies them, and the same rules (invoicing/calculation.py
HANDLING_FEE_RULES) are what the office's bookings use. One price list, two
screens that cannot disagree.
"""

from decimal import Decimal, InvalidOperation

from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .calculation import handling_fee, handling_fee_as_json, handling_rules_as_json

# A ceiling on what the calculator can ask about; anything above is a typo.
MAX_VALUE = Decimal("10000000")


class HandlingFeeView(APIView):
    """GET: the handling-cost rules. GET ?value=750: also the fee for that value.

    Public: these are the prices the website shows anyway. Nothing is saved.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        answer = {"rules": handling_rules_as_json()}
        raw = request.query_params.get("value")
        if raw is not None:
            try:
                value = Decimal(raw.strip().replace(",", "."))
            except (InvalidOperation, AttributeError):
                raise ValidationError({"value": "Give the purchase value as a number."}) from None
            if not value.is_finite() or value < 0 or value > MAX_VALUE:
                raise ValidationError({"value": "Give a purchase value of 0 or more."})
            answer["handling"] = handling_fee_as_json(handling_fee(value))
        return Response(answer)
