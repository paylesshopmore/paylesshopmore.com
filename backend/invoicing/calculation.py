"""The arithmetic of an invoice, in one place.

READ THIS FIRST if you are new to the invoicing code.

Every number printed on an invoice comes from the functions in this file:
the subtotal, the contractual adjustments, the VAT and the total to pay, plus
the volume calculator the office uses when it measures boxes.

Why one file?

* The server is the authority. The browser shows totals as you type (see
  frontend/src/pages/Dashboard/invoice/invoiceMath.js, which is a copy of
  these rules in JavaScript), but what gets saved and printed is always
  recalculated here. A browser can be edited by whoever is using it; this
  code cannot.
* Both copies are tested against the same list of examples,
  invoicing/fixtures/calculation_cases.json. If you change a rule here, change
  it in invoiceMath.js too, and the shared tests will tell you if the two
  disagree.

Money rules used everywhere below:

* Money is always a Decimal, never a float. 0.1 + 0.2 is not 0.3 in floating
  point, and an invoice that is a cent off is a wrong invoice.
* Amounts are rounded to whole cents with ROUND_HALF_UP (0.005 -> 0.01), the
  rounding people expect from a calculator.
"""

from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
ZERO = Decimal("0")

# The industry rule for volume weight with centimetres: a box "weighs" its
# volume in cm3 divided by 6000. A big light box costs as much to fly as a
# small heavy one, and this is how carriers make that fair.
VOLUME_WEIGHT_DIVISOR = Decimal("6000")
# cm3 in one m3 (100 x 100 x 100).
CM3_PER_M3 = Decimal("1000000")


def to_cents(value):
    """Round any number to whole cents. `None` stays `None`.

    ROUND_HALF_UP rounds halves *away from zero*: 0.005 -> 0.01 and
    -0.005 -> -0.01. The JavaScript copy does the same.
    """
    if value is None:
        return None
    rounded = Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)
    # Decimal keeps a sign on zero, so 0% VAT on a credit would print as
    # "-0,00". Zero is zero.
    return abs(rounded) if rounded == 0 else rounded


# ---- packages and volume ---------------------------------------------------


def measure_packages(measurements):
    """Volume and volume weight for a list of measured packages.

    `measurements` is a list of dicts, one per *kind* of box:

        [{"length_cm": 120, "width_cm": 80, "height_cm": 100, "count": 2}, ...]

    "count": 2 means two boxes of exactly that size, so they are multiplied
    rather than typed in twice.

    Returns a dict with three numbers, which mean different things - keep
    them apart when you show them:

    * pieces            - how many boxes in total.
    * volume_m3         - the space they take up, in cubic metres (sea freight
                          is priced on this). Rounded to 3 decimals.
    * volume_weight_kg  - length x width x height / 6000 per box, added up (air
                          freight is priced on this). Rounded to 2 decimals.

    The *actual* weight is not here: that comes off the scale, not the tape
    measure, and is entered separately.
    """
    pieces = 0
    total_cm3 = ZERO

    for row in measurements or []:
        count = int(row.get("count") or 0)
        length = Decimal(row.get("length_cm") or 0)
        width = Decimal(row.get("width_cm") or 0)
        height = Decimal(row.get("height_cm") or 0)

        pieces += count
        total_cm3 += length * width * height * count

    return {
        "pieces": pieces,
        "volume_m3": (total_cm3 / CM3_PER_M3).quantize(
            Decimal("0.001"), rounding=ROUND_HALF_UP
        ),
        "volume_weight_kg": (total_cm3 / VOLUME_WEIGHT_DIVISOR).quantize(
            CENT, rounding=ROUND_HALF_UP
        ),
    }


def chargeable_weight(actual_kg, volume_weight_kg):
    """The weight air freight is charged on: whichever is higher.

    Either may be missing (None). With neither, the answer is None.
    """
    known = [Decimal(w) for w in (actual_kg, volume_weight_kg) if w is not None]
    return max(known) if known else None


# ---- insurance -------------------------------------------------------------


def insurance_fee(insured_value, rate_percent, minimum=None):
    """The insurance premium, when the business has configured a rate.

    The rate is set by an admin on the invoice settings page. This code never
    invents one: if no rate is configured (`rate_percent` is None) it returns
    None, and the office types the fee in by hand instead.

        insured_value 8390.00, rate 1.5%, minimum 25.00  ->  125.85
        insured_value 1000.00, rate 1.5%, minimum 25.00  ->   25.00 (minimum)
    """
    if rate_percent is None or insured_value is None:
        return None

    fee = to_cents(Decimal(insured_value) * Decimal(rate_percent) / 100)
    if minimum is not None:
        fee = max(fee, to_cents(minimum))
    return fee


# ---- the totals ------------------------------------------------------------


def calculate_totals(charges, adjustments, vat_rate_percent):
    """Everything in the financial summary of an invoice.

    charges           - amounts of the service lines (Zeevracht, Handling
                        Fee, the insurance line ...).
    adjustments       - amounts of the contractual adjustments printed under
                        the subtotal. Can be negative (money back to the
                        customer) or positive (an extra agreed charge); do
                        not assume they are discounts.
    vat_rate_percent  - 0 for a verified export, otherwise the normal rate.

    Returns a dict of Decimals, in the order they are printed:

        subtotal      "Subtotaal dienstverlening"   sum of the charges
        adjustments   "Contractuele verrekening"    sum of the adjustments
        total_excl    "Totaal excl. BTW"            subtotal + adjustments
        vat           "Totaal BTW (x%)"             total_excl x rate
        total         "Totaal te betalen"           total_excl + vat

    A negative total is allowed: it means we owe the customer money (a credit
    invoice). Use `is_credit()` to word it that way on screen.
    """
    subtotal = to_cents(sum((Decimal(a) for a in charges), ZERO))
    adjusted = to_cents(sum((Decimal(a) for a in adjustments), ZERO))
    total_excl = subtotal + adjusted
    # VAT is worked out on the amount after adjustments, then rounded once.
    vat = to_cents(total_excl * Decimal(vat_rate_percent) / 100)

    return {
        "subtotal": subtotal,
        "adjustments": adjusted,
        "total_excl": total_excl,
        "vat_rate": Decimal(vat_rate_percent),
        "vat": vat,
        "total": total_excl + vat,
    }


def is_credit(total):
    """True when the invoice ends in money owed *to* the customer."""
    return total is not None and Decimal(total) < 0


# ---- handling costs ----------------------------------------------------------

# The handling costs, by purchase value. The ONE place these amounts live:
# the shipping calculator reads them from /api/pricing/handling/ (so the
# website never has its own copy), and the office's bookings work them out
# with handling_fee() below.
#
# Read top to bottom; the first rule whose ceiling the value does not exceed
# applies. `up_to_eur` is inclusive - exactly EUR 500 is still EUR 50 - and
# None means "anything above the rules before it".
#
# `suppliers_included`: how many suppliers (webshops) the rate covers. The
# EUR 150 rate covers 2. More suppliers than that has no approved price yet,
# so nothing is added for them - the office is shown the count and decides.
# None: no supplier limit was given for that rate.
HANDLING_FEE_RULES = (
    {"up_to_eur": Decimal("500.00"), "fee_eur": Decimal("50.00"), "suppliers_included": None},
    {"up_to_eur": None, "fee_eur": Decimal("150.00"), "suppliers_included": 2},
)


def handling_fee(purchase_value, suppliers=None, rules=HANDLING_FEE_RULES):
    """The handling costs for a purchase value, with how they were found.

        handling_fee(Decimal("500"))   -> fee 50.00   (up to and including 500)
        handling_fee(Decimal("500.01"))-> fee 150.00

    Returns None when there is no purchase value (nothing to go on), else:

        {"purchase_value_eur": Decimal, "fee_eur": Decimal, "rule": 0,
         "suppliers": 3 or None, "suppliers_included": 2 or None,
         "over_supplier_limit": True/False}

    `over_supplier_limit` only says the count is above what the rate covers;
    it does not change the fee (see HANDLING_FEE_RULES).

    Raises ValueError for a negative value: a purchase cannot cost less than
    nothing, and a fee worked out from one would be meaningless.
    """
    if purchase_value is None or purchase_value == "":
        return None
    value = to_cents(Decimal(str(purchase_value)))
    if value < ZERO:
        raise ValueError("A purchase value cannot be negative.")

    for index, rule in enumerate(rules):
        ceiling = rule["up_to_eur"]
        if ceiling is None or value <= ceiling:
            included = rule["suppliers_included"]
            return {
                "purchase_value_eur": value,
                "fee_eur": to_cents(rule["fee_eur"]),
                "rule": index,
                "suppliers": suppliers,
                "suppliers_included": included,
                "over_supplier_limit": bool(
                    included is not None and suppliers is not None and suppliers > included
                ),
            }
    # The last rule has no ceiling, so this is only reached with broken rules.
    raise ValueError("The handling fee rules do not cover this value.")


def handling_fee_as_json(result):
    """handling_fee()'s answer with the amounts as strings, for the API."""
    if result is None:
        return None
    return {
        **result,
        "purchase_value_eur": str(result["purchase_value_eur"]),
        "fee_eur": str(result["fee_eur"]),
    }


def handling_rules_as_json(rules=HANDLING_FEE_RULES):
    """The rules for the calculator page, amounts as strings."""
    return [
        {
            "up_to_eur": None if rule["up_to_eur"] is None else str(rule["up_to_eur"]),
            "fee_eur": str(rule["fee_eur"]),
            "suppliers_included": rule["suppliers_included"],
        }
        for rule in rules
    ]
