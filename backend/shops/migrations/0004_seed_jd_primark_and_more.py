"""Seed JD Sports, Primark, PlutoSport, Lidl, Leen Bakker and Winparts.

Same pattern as 0003: the services page reads its shops from this table, so a
shop that is only in src/data/shops.js never shows once the API answers.

Matched on the name ignoring case, so a shop the office already added by hand
is left alone rather than duplicated. The names are spelled exactly as in
src/data/shops.js, which is what lets each row borrow the bundled logo until
one is uploaded.

Reversible, and the reverse only removes rows this migration created.
"""

from django.db import migrations

SEED = [
    ("JD Sports", "https://www.jdsports.nl/"),
    ("Primark", "https://www.primark.com/nl-nl"),
    ("PlutoSport", "https://www.plutosport.nl/"),
    ("Lidl", "https://www.lidl.nl/"),
    ("Leen Bakker", "https://www.leenbakker.nl/"),
    ("Winparts", "https://www.winparts.nl/"),
]


def seed(apps, schema_editor):
    Shop = apps.get_model("shops", "Shop")

    for name, url in SEED:
        if Shop.objects.filter(name__iexact=name).exists():
            continue
        Shop.objects.create(name=name, url=url, sort_order=0, is_active=True)


def unseed(apps, schema_editor):
    Shop = apps.get_model("shops", "Shop")
    # Only rows that still look exactly like the seed: one the office has
    # since given a logo or a description is theirs now, not ours to delete.
    Shop.objects.filter(
        name__in=[name for name, _ in SEED], logo="", description=""
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("shops", "0003_seed_more_shops")]

    operations = [migrations.RunPython(seed, unseed)]
