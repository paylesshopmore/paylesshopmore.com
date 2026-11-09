"""Bring back "Other" in the courier list, as the last choice.

0006 hid it so the list stayed short (PostNL, DHL, DPD, Amazon, FedEx). But a
customer whose parcel comes with a courier not on the list had nothing to
pick. "Other" has no 17TRACK carrier code, so 17TRACK works out the courier
from the tracking number itself, and the link goes to the general tracking
page (Carrier.tracking_url).

Made if it is missing (a database that never had the seed rows).
"""

from django.db import migrations

OTHER_POSITION = 60  # after FedEx (50)


def show_other(apps, schema_editor):
    Carrier = apps.get_model("tracking", "Carrier")
    carrier, created = Carrier.objects.get_or_create(
        code="other",
        defaults={"name": "Other", "is_active": True, "position": OTHER_POSITION},
    )
    if not created:
        carrier.is_active = True
        carrier.position = OTHER_POSITION
        carrier.save(update_fields=["is_active", "position"])


def hide_other(apps, schema_editor):
    Carrier = apps.get_model("tracking", "Carrier")
    Carrier.objects.filter(code="other").update(is_active=False)


class Migration(migrations.Migration):
    dependencies = [
        ("tracking", "0007_tracking_foundation"),
    ]

    operations = [
        migrations.RunPython(show_other, hide_other),
    ]
