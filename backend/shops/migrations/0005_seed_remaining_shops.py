"""Seed the last bundled shops that no migration had added yet.

0002 to 0004 seeded 21 of the shops in src/data/shops.js. These 8 had only
ever been added by hand on the live site, so a database that never had that
done - a fresh one, or one that was reset - was missing them.

Matched on the name ignoring case, so a shop the office already has is left
alone rather than duplicated. "Swiss Sense" is also matched as "Swisssense",
the spelling it was once added under by hand. The names are spelled exactly
as in src/data/shops.js, which is what lets each row borrow the bundled logo
until one is uploaded.

Reversible, and the reverse only removes rows this migration created.
"""

from django.db import migrations

SEED = [
    ("Babypark", "https://www.babypark.nl/"),
    ("Decathlon", "https://www.decathlon.nl/"),
    ("Hornbach", "https://www.hornbach.nl/"),
    ("JYSK", "https://jysk.nl/"),
    ("Karwei", "https://www.karwei.nl/"),
    ("Kraaywijn", "https://www.kraaywijn.nl/"),
    ("Prenatal", "https://www.prenatal.nl/"),
    ("Swiss Sense", "https://www.swisssense.nl/"),
]


def seed(apps, schema_editor):
    Shop = apps.get_model("shops", "Shop")

    for name, url in SEED:
        spellings = {name, name.replace(" ", "")}
        if any(Shop.objects.filter(name__iexact=spelling).exists() for spelling in spellings):
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
    dependencies = [("shops", "0004_seed_jd_primark_and_more")]

    operations = [migrations.RunPython(seed, unseed)]
