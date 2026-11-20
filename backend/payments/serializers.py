from rest_framework import serializers

from .models import NUMBER_RE


class CheckoutSerializer(serializers.Serializer):
    """The only thing the browser may send: the invoice number.

    No amount, no currency. Those come from our database (see views.py), so
    nobody can pay 1 cent for a 500 euro invoice by editing the request.
    """

    number = serializers.CharField(max_length=40)

    def validate_number(self, value):
        # People type with stray spaces and in lower case: "  plsm-10231 ".
        number = value.strip().upper()
        if not NUMBER_RE.match(number):
            raise serializers.ValidationError("Invalid invoice number.")
        return number
