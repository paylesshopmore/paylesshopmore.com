"""Seed the shops added to the React app's bundled list after 0002.

The services page reads its shops from this table, so a shop that only lives
in src/data/shops.js never shows once the API answers. These are the ones
that were missing from the live page.

Matched on the name ignoring case, so a shop the office already added by hand
(say "ZEEMAN") is left alone rather than duplicated. The names are spelled
exactly as in src/data/shops.js, which is what lets each row borrow the
bundled logo until one is uploaded.

sort_order 0 so they fall into the page's alphabetical order by name.

Reversible, and the reverse only removes rows this migration created.
"""

from django.db import migrations

SEED = [
    ("Amazon", "https://www.amazon.nl/"),
    ("Bershka", "https://www.bershka.com/nl/"),
    ("HEMA", "https://www.hema.nl/"),
    ("Pull&Bear", "https://www.pullandbear.com/nl/"),
    ("SHEIN", "https://nl.shein.com/"),
    ("Zara", "https://www.zara.com/nl/"),
    ("Zeeman", "https://www.zeeman.com/nl-nl"),
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
    dependencies = [("shops", "0002_seed_shops")]

    operations = [migrations.RunPython(seed, unseed)]
