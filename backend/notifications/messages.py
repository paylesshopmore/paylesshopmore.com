"""Turning a notification into the words that go in an e-mail.

In the customer's own language: Dutch, English or Papiamentu, read from
User.language, which the React app keeps in step with the language the
customer reads the site in. An account that has not been seen since that field
was added has no language yet and is written to in Dutch, the site's default -
the same fallback as the password-reset mail (accounts/emails.py).

The subject lines are the same sentences the React app shows for the same
`kind` and `status` (the `notifications` block in
frontend/src/i18n/translations.js), so the bell and the inbox say the same
thing. Keep the two in step when a status is added.

Kept apart from tasks.py so that what a message says can be tested without an
outbox, and apart from models.py so that a wording change is not a migration.
"""

import re

from django.conf import settings

from .models import Notification

DEFAULT_LANGUAGE = "nl"

# Per language: the subject per status (as in translations.js), one longer
# line per status for the body, and the fixed phrases around them.
#
# Keys are Package.Status values, plus "received" for the warehouse receiving
# the goods (notifications/services.py, notify_shipment_received), plus
# "courier_<status>" for news from a webshop's courier (tracking/sync.py,
# notify_customer). Kept as
# literals because this module is about wording and should not drag the
# accounts app in to say a sentence.
MESSAGES = {
    "en": {
        "subjects": {
            "received": "Your shipment has arrived at our warehouse",
            "quoted": "Your quote is ready",
            "paid": "Payment received",
            "purchased": "Your products have been purchased",
            "ready_for_shipping": "Your shipment is packed and ready to leave",
            "in_transit": "Your shipment is on its way",
            "arrived": "Your shipment has arrived",
            "delivered": "Your shipment has been delivered",
            "cancelled": "Your shipment has been cancelled",
            "prealert_submitted": "Your pre-alert has been registered",
            "courier_delivered": "Your order has been delivered to our warehouse",
            "courier_delivery_failed": "The courier could not deliver your order",
            "courier_delayed": "Your order is delayed",
            "courier_returned": "Your order is being returned to the shop",
            "courier_exception": "There is a problem with your order's delivery",
            "item_received": "An item of your order has arrived at our warehouse",
            "order_received": "Your order has arrived at our warehouse",
            "invoice_requested": "We are missing the invoice of your order",
            "confirmation_requested": "Order Confirmation Required | Pay Less Shop More",
        },
        "lines": {
            "received": "We have received your goods at our warehouse. We will measure and pack them for shipping.",
            "quoted": "We have prepared a quote for your shipment.",
            "paid": "We have received your payment. Your shipment is being prepared.",
            "purchased": "Your products have been purchased.",
            "ready_for_shipping": (
                "Your shipment is packed and waiting to leave. It can no longer be "
                "added to - anything bought now travels as a separate shipment."
            ),
            "in_transit": "Your shipment is on its way.",
            "arrived": "Your shipment has arrived at its destination.",
            "delivered": "Your shipment has been delivered.",
            "cancelled": "Your shipment has been cancelled.",
            "prealert_submitted": (
                "We have registered your pre-alert. We will let you know when the parcel arrives "
                "at our warehouse."
            ),
            "courier_delivered": "The courier has delivered your order to our warehouse. We will register it shortly.",
            "courier_delivery_failed": (
                "The courier tried to deliver your order to our warehouse but could not. Check "
                "the courier's page or contact the shop."
            ),
            "courier_delayed": "The courier reports that your order is delayed.",
            "courier_returned": "The courier is returning your order to the shop. Please contact the shop.",
            "courier_exception": "The courier reports a problem with your order. Please contact the shop or us.",
            "item_received": (
                "We have received {item} (from {shop}) at our warehouse. "
                "Other items of your order may still be on their way."
            ),
            "order_received": "We have received your whole order from {shop} ({item}) at our warehouse.",
            "invoice_requested": (
                "We cannot find the invoice for {item} (from {shop}). Please add it to your booking "
                "so that we can process your order."
            ),
            "confirmation_requested": (
                "We are processing your booking. Please upload your order confirmation so our warehouse "
                "team can verify the products associated with your booking."
            ),
        },
        "default_subject": "Shipment update",
        "default_line": "There is an update on your shipment.",
        "hello": "Hello {name},",
        "hello_anonymous": "Hello,",
        "tracking": "Tracking number: {tracking}",
        "invoice_subject": "Invoice {number}",
        "invoice_subject_unnumbered": "Invoice for your shipment",
        "invoice_ready": "Your invoice {number} is ready.",
        "invoice_ready_unnumbered": "Your invoice is ready.",
        "invoice_covers": "It covers shipment {tracking}.",
        "invoice_download": "You can download it from your profile page:",
        "invoice_upload": "You can add it to your booking on your profile page:",
        "confirmation_booking": "Booking Number: {booking}",
        "confirmation_upload": "You can upload the document through your Pay Less Shop More account:",
        "confirmation_thanks": "Thank you,",
        "confirmation_team": "Pay Less Shop More Team",
        "review": "How did it go? Tell us in one click - rate your delivery:",
        "preferences": "You can change which e-mails you receive on your profile page:",
    },
    "nl": {
        "subjects": {
            "received": "Uw zending is aangekomen in ons magazijn",
            "quoted": "Uw offerte staat klaar",
            "paid": "Betaling ontvangen",
            "purchased": "Uw producten zijn gekocht",
            "ready_for_shipping": "Uw zending is ingepakt en klaar voor vertrek",
            "in_transit": "Uw zending is onderweg",
            "arrived": "Uw zending is aangekomen",
            "delivered": "Uw zending is afgeleverd",
            "cancelled": "Uw zending is geannuleerd",
            "prealert_submitted": "Uw pre-alert is geregistreerd",
            "courier_delivered": "Uw bestelling is bezorgd bij ons magazijn",
            "courier_delivery_failed": "De koerier kon uw bestelling niet bezorgen",
            "courier_delayed": "Uw bestelling heeft vertraging",
            "courier_returned": "Uw bestelling gaat terug naar de winkel",
            "courier_exception": "Er is een probleem met de bezorging van uw bestelling",
            "item_received": "Een product van uw bestelling is aangekomen in ons magazijn",
            "order_received": "Uw bestelling is aangekomen in ons magazijn",
            "invoice_requested": "Wij missen de factuur van uw bestelling",
            "confirmation_requested": "Orderbevestiging vereist | Pay Less Shop More",
        },
        "lines": {
            "received": (
                "Wij hebben uw goederen ontvangen in ons magazijn. "
                "Wij meten ze op en pakken ze in voor verzending."
            ),
            "quoted": "Wij hebben een offerte voor uw zending opgesteld.",
            "paid": "Wij hebben uw betaling ontvangen. Uw zending wordt voorbereid.",
            "purchased": "Uw producten zijn gekocht.",
            "ready_for_shipping": (
                "Uw zending is ingepakt en wacht op vertrek. Er kan niets meer aan "
                "worden toegevoegd - wat u nu koopt, reist als een aparte zending."
            ),
            "in_transit": "Uw zending is onderweg.",
            "arrived": "Uw zending is aangekomen op de bestemming.",
            "delivered": "Uw zending is afgeleverd.",
            "cancelled": "Uw zending is geannuleerd.",
            "prealert_submitted": (
                "Wij hebben uw pre-alert geregistreerd. Wij laten het u weten zodra het pakket in"
                " ons magazijn aankomt."
            ),
            "courier_delivered": (
                "De koerier heeft uw bestelling bij ons magazijn bezorgd. Wij registreren hem "
                "binnenkort."
            ),
            "courier_delivery_failed": (
                "De koerier probeerde uw bestelling bij ons magazijn te bezorgen, maar dat lukte "
                "niet. Kijk op de pagina van de koerier of neem contact op met de winkel."
            ),
            "courier_delayed": "De koerier meldt dat uw bestelling vertraging heeft.",
            "courier_returned": "De koerier stuurt uw bestelling terug naar de winkel. Neem contact op met de winkel.",
            "courier_exception": (
                "De koerier meldt een probleem met uw bestelling. Neem contact op met de winkel "
                "of met ons."
            ),
            "item_received": (
                "Wij hebben {item} (van {shop}) ontvangen in ons magazijn. "
                "Andere producten van uw bestelling kunnen nog onderweg zijn."
            ),
            "order_received": "Wij hebben uw hele bestelling van {shop} ({item}) ontvangen in ons magazijn.",
            "invoice_requested": (
                "Wij kunnen de factuur van {item} (van {shop}) niet vinden. Wilt u deze toevoegen aan "
                "uw boeking, zodat wij uw bestelling kunnen verwerken?"
            ),
            "confirmation_requested": (
                "Wij verwerken uw boeking. Wilt u uw orderbevestiging uploaden, zodat ons magazijnteam de "
                "producten bij uw boeking kan controleren?"
            ),
        },
        "default_subject": "Nieuws over uw zending",
        "default_line": "Er is nieuws over uw zending.",
        "hello": "Beste {name},",
        "hello_anonymous": "Beste klant,",
        "tracking": "Trackingnummer: {tracking}",
        "invoice_subject": "Factuur {number}",
        "invoice_subject_unnumbered": "Factuur voor uw zending",
        "invoice_ready": "Uw factuur {number} staat klaar.",
        "invoice_ready_unnumbered": "Uw factuur staat klaar.",
        "invoice_covers": "Deze hoort bij zending {tracking}.",
        "invoice_download": "U kunt de factuur downloaden op uw profielpagina:",
        "invoice_upload": "U kunt de factuur toevoegen bij uw boeking op uw profielpagina:",
        "confirmation_booking": "Boekingsnummer: {booking}",
        "confirmation_upload": "U kunt het document uploaden via uw Pay Less Shop More-account:",
        "confirmation_thanks": "Bedankt,",
        "confirmation_team": "Team Pay Less Shop More",
        "review": "Hoe is het gegaan? Geef uw levering een beoordeling:",
        "preferences": "Op uw profielpagina kiest u welke e-mails u van ons ontvangt:",
    },
    "pap": {
        "subjects": {
            "received": "Bo enbio a yega na nos depósito",
            "quoted": "Bo ofèrta ta kla",
            "paid": "Pago risibí",
            "purchased": "Bo produktonan a wòrdu kumprá",
            "ready_for_shipping": "Bo enbio ta paká i kla pa sali",
            "in_transit": "Bo enbio ta na kaminda",
            "arrived": "Bo enbio a yega",
            "delivered": "Bo enbio a wòrdu entregá",
            "cancelled": "Bo enbio a wòrdu kanselá",
            "prealert_submitted": "Bo pre-alerta a wòrdu registrá",
            "courier_delivered": "Bo òrdu a wòrdu entregá na nos pakus",
            "courier_delivery_failed": "E kurier no por a entregá bo òrdu",
            "courier_delayed": "Bo òrdu tin atraso",
            "courier_returned": "Bo òrdu ta bai bèk na e tienda",
            "courier_exception": "Tin un problema ku e entrega di bo òrdu",
            "item_received": "Un produkto di bo òrdu a yega na nos depósito",
            "order_received": "Bo òrdu a yega na nos depósito",
            "invoice_requested": "Nos ta falta e faktura di bo òrdu",
            "confirmation_requested": "Konfirmashon di òrdu rekeri | Pay Less Shop More",
        },
        "lines": {
            "received": "Nos a risibí bo merkansia na nos depósito. Nos lo midi i paka nan pa manda.",
            "quoted": "Nos a prepará un ofèrta pa bo enbio.",
            "paid": "Nos a risibí bo pago. Nos ta prepará bo enbio.",
            "purchased": "Bo produktonan a wòrdu kumprá.",
            "ready_for_shipping": (
                "Bo enbio ta paká i ta warda pa sali. No por agregá nada mas na dje - "
                "loke bo kumpra awor ta biaha komo un enbio separá."
            ),
            "in_transit": "Bo enbio ta na kaminda.",
            "arrived": "Bo enbio a yega na su destinashon.",
            "delivered": "Bo enbio a wòrdu entregá.",
            "cancelled": "Bo enbio a wòrdu kanselá.",
            "prealert_submitted": "Nos a registrá bo pre-alerta. Nos ta laga bo sa ora e pakete yega nos pakus.",
            "courier_delivered": "E kurier a entregá bo òrdu na nos pakus. Nos ta registr'é pronto.",
            "courier_delivery_failed": (
                "E kurier a purba entregá bo òrdu na nos pakus, pero no por a hasi esaki. Wak e "
                "página di e kurier òf tuma kontakto ku e tienda."
            ),
            "courier_delayed": "E kurier ta bisa ku bo òrdu tin atraso.",
            "courier_returned": "E kurier ta mand'e bo òrdu bèk na e tienda. Por fabor tuma kontakto ku e tienda.",
            "courier_exception": (
                "E kurier ta reportá un problema ku bo òrdu. Por fabor tuma kontakto ku e tienda "
                "òf ku nos."
            ),
            "item_received": (
                "Nos a risibí {item} (di {shop}) na nos depósito. "
                "Otro produktonan di bo òrdu por ainda ta na kaminda."
            ),
            "order_received": "Nos a risibí henter bo òrdu di {shop} ({item}) na nos depósito.",
            "invoice_requested": (
                "Nos no por haña e faktura di {item} (di {shop}). Por fabor agregá e na bo reservashon "
                "pa nos por prosesá bo òrdu."
            ),
            "confirmation_requested": (
                "Nos ta prosesá bo reservashon. Por fabor karga bo konfirmashon di òrdu pa nos tim di "
                "warehouse por verifiká e produktonan di bo reservashon."
            ),
        },
        "default_subject": "Notisia tokante bo enbio",
        "default_line": "Tin notisia tokante bo enbio.",
        "hello": "Kerido {name},",
        "hello_anonymous": "Kerido kliente,",
        "tracking": "Number di track & trace: {tracking}",
        "invoice_subject": "Faktura {number}",
        "invoice_subject_unnumbered": "Faktura pa bo enbio",
        "invoice_ready": "Bo faktura {number} ta kla.",
        "invoice_ready_unnumbered": "Bo faktura ta kla.",
        "invoice_covers": "E ta pa enbio {tracking}.",
        "invoice_download": "Bo por baha e faktura for di bo página di perfil:",
        "invoice_upload": "Bo por agregá e faktura na bo reservashon riba bo página di perfil:",
        "confirmation_booking": "Number di reservashon: {booking}",
        "confirmation_upload": "Bo por karga e dokumento via bo kuenta di Pay Less Shop More:",
        "confirmation_thanks": "Danki,",
        "confirmation_team": "Tim di Pay Less Shop More",
        "review": "Kon e la bai? Duna bo entrega un evaluashon:",
        "preferences": "Riba bo página di perfil bo ta skohe kua e-mail bo ke risibí di nos:",
    },
}

# Kept for code that reads the English lines directly.
SHIPMENT_LINES = MESSAGES["en"]["lines"]
SHIPMENT_SUBJECTS = MESSAGES["en"]["subjects"]


def language_for(notification):
    """The customer's language, or Dutch when they have not set one."""
    language = getattr(notification.user, "language", "") or ""
    return language if language in MESSAGES else DEFAULT_LANGUAGE


def _copy(notification):
    return MESSAGES[language_for(notification)]


def _tracking(context):
    return context.get("tracking_number") or ""


def _fill(line, context):
    """Put the facts in a line that asks for them: {item} and {shop}.

    Not str.format, and not two replaces one after the other: the item name
    is what the customer typed, and a "{" or even a "{shop}" in it must come
    out exactly as typed. So the line is read once, left to right, and each
    placeholder is swapped for its fact in that single pass. A fact we do not
    have becomes an empty word rather than a visible "{shop}".
    """
    return re.sub(
        r"\{(item|shop|booking)\}",
        lambda match: str(context.get("booking_number" if match.group(1) == "booking" else match.group(1)) or ""),
        line,
    )


def subject_for(notification):
    """The e-mail subject line, in the customer's language."""
    copy = _copy(notification)
    context = notification.context or {}

    if notification.kind == Notification.Kind.INVOICE_SENT:
        number = context.get("invoice_number")
        return copy["invoice_subject"].format(number=number) if number else copy["invoice_subject_unnumbered"]

    subject = copy["subjects"].get(context.get("status"), copy["default_subject"])
    # A request for a document already names the booking in its own text; its
    # subject is used exactly as written, without a tracking number after it.
    if context.get("status") == "confirmation_requested":
        return subject
    tracking = _tracking(context)
    return f"{subject} ({tracking})" if tracking else subject


def body_for(notification):
    """The plain-text e-mail body, in the customer's language.

    Plain text, not HTML: the site's other e-mails are plain text too, so this
    needs no template engine, renders in every client, and cannot leak a
    tracking pixel into a message about somebody's money.
    """
    copy = _copy(notification)
    context = notification.context or {}
    tracking = _tracking(context)

    name = notification.user.get_full_name().strip()
    lines = [copy["hello"].format(name=name) if name else copy["hello_anonymous"], ""]

    if notification.kind == Notification.Kind.INVOICE_SENT:
        number = context.get("invoice_number")
        lines.append(
            copy["invoice_ready"].format(number=number) if number else copy["invoice_ready_unnumbered"]
        )
        if tracking:
            lines.append(copy["invoice_covers"].format(tracking=tracking))
        lines += [
            "",
            copy["invoice_download"],
            f"{settings.FRONTEND_URL}/profile#invoices",
        ]
    else:
        line = copy["lines"].get(context.get("status"), copy["default_line"])
        lines.append(_fill(line, context))
        if context.get("status") == "confirmation_requested":
            # "Please upload your order confirmation" - which booking it is, where
            # to upload it, and a polite closing.
            lines += [
                "",
                _fill(copy["confirmation_booking"], context),
                "",
                copy["confirmation_upload"],
                f"{settings.FRONTEND_URL}/profile#bookings",
                "",
                copy["confirmation_thanks"],
                copy["confirmation_team"],
            ]
        elif context.get("status") == "invoice_requested":
            # Not a tracking page: the place to add the invoice is the booking.
            lines += ["", copy["invoice_upload"], f"{settings.FRONTEND_URL}/profile#bookings"]
        elif tracking:
            lines += [
                "",
                copy["tracking"].format(tracking=tracking),
                f"{settings.FRONTEND_URL}/tracking?number={tracking}",
            ]
        # Delivered: ask for a review (feedback app). The link opens the
        # review card on the profile page with this shipment chosen.
        if context.get("status") == "delivered" and notification.package_id:
            lines += [
                "",
                copy["review"],
                f"{settings.FRONTEND_URL}/profile?review={notification.package_id}#reviews",
            ]

    lines += [
        "",
        copy["preferences"],
        f"{settings.FRONTEND_URL}/profile#notifications",
        "",
        "PayLesShopMore.com",
    ]

    return "\n".join(lines)
