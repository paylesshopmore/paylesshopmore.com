"""How a sign-in attempt is shown to the office.

Only the fields the page needs. Never the session hash, never anything that
could be a secret - there is nothing like that in the table to begin with (see
models.py), and this list is the second wall.
"""

from rest_framework import serializers

from .models import LoginActivity


class LoginActivitySerializer(serializers.ModelSerializer):
    """One row of the table and one marker's popup."""

    # "Windows 10/11", or "iPhone (iOS)": what the popup calls the device.
    device = serializers.CharField(source="device_label", read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LoginActivity
        fields = [
            "id",
            "user",
            "identifier",
            "ip_address",
            "country",
            "country_code",
            "region",
            "city",
            "latitude",
            "longitude",
            "device",
            "device_type",
            "browser",
            "os",
            "status",
            "method",
            "security_status",
            "flags",
            "reviewed_at",
            "reviewed_by_name",
            "created_at",
        ]
        read_only_fields = fields

    def get_reviewed_by_name(self, row):
        who = row.reviewed_by
        return (who.get_full_name() or who.get_username()) if who else ""
