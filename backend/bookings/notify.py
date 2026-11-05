"""The e-mail the office gets when somebody sends the booking form.

Who gets it: settings.BOOKING_NOTIFY_EMAILS - the office's own mailbox by
default (DJANGO_BOOKING_NOTIFY_EMAILS to change it, a comma-separated list).
A fixed list rather than every staff account, so it lands where the office
reads mail and is not multiplied by everybody who has a dashboard login.

What is in it: enough to know what came in without opening the dashboard -
who sends it, where it goes, sea or air, the stores and products (with their
links), the value and the handling costs - and a link straight to the booking.
Plain text: it is read by the office, and a plain message cannot hide a link
behind other text. The customer's own words are only ever data in it.

Sent from bookings/tasks.py, queued after the booking is saved
(bookings/views.py BookingCreateView), so a slow or broken mail server never
delays or fails the customer's booking.
"""

from django.conf import settings

from .serializers import handling_for


def recipients():
    """The addresses to tell about a new booking, deduplicated, in order."""
    configured = getattr(settings, "BOOKING_NOTIFY_EMAILS", ())
    seen = set()
    out = []
    for address in configured:
        address = (address or "").strip()
        if address and address.casefold() not in seen:
            seen.add(address.casefold())
            out.append(address)
    return out


def subject_for(booking):
    """"New booking #41 - Maria Martina (Curaçao, sea freight)"."""
    return (
        f"New booking #{booking.pk} - {booking.sender_name or 'unknown sender'} "
        f"({booking.destination_label}, {booking.get_freight_display()})"
    )


def _line(label, value):
    return f"{label}: {value}" if value not in (None, "") else None


def body_for(booking):
    """The booking as plain text, newest information first."""
    handling = handling_for(booking)
    lines = [
        "A new booking has come in through the website.",
        "",
        _line("Booking", f"#{booking.pk}"),
        _line("Received", booking.created_at.strftime("%d-%m-%Y %H:%M")),
        _line("Account", booking.user.email if booking.user_id else "sent without signing in"),
        "",
        "SENDER",
        _line("Name", booking.sender_name),
        _line("E-mail", booking.sender_email),
        _line("Phone", booking.sender_phone),
        _line(
            "Address",
            f"{booking.sender_address}, {booking.sender_postal_code} {booking.sender_city}",
        ),
        "",
        "RECIPIENT",
        _line("Name", booking.recipient_name),
        _line("Phone", booking.recipient_phone),
        _line("Address", f"{booking.recipient_address}, {booking.recipient_city}"),
        "",
        "SHIPMENT",
        _line("Destination", booking.destination_label),
        _line("Freight", booking.get_freight_display()),
        _line("Packing", booking.get_packing_display()),
        _line("Value", f"EUR {booking.value_eur}" if booking.value_eur is not None else None),
        _line("Handling costs", f"EUR {handling['fee_eur']}" if handling else None),
        _line("Insured value", f"EUR {booking.insured_value_eur}" if booking.insured else None),
    ]

    orders = list(booking.orders.all())
    if orders:
        lines += ["", f"ORDERS ({len(orders)} supplier{'s' if len(orders) != 1 else ''})"]
        for order in orders:
            lines.append(f"- {order.shop_name}: {order.description}")
            for product in order.products.all():
                lines.append(f"    * {product.description}")
                if product.url:
                    lines.append(f"      {product.url}")
            shots = len(order.screenshots.all())
            if shots:
                lines.append(f"    ({shots} screenshot{'s' if shots != 1 else ''} - see the dashboard)")
    elif booking.contents:
        lines += ["", "CONTENTS", booking.contents]

    if booking.notes:
        lines += ["", "SENDER'S REMARKS", booking.notes]

    lines += [
        "",
        "Open the booking in the dashboard:",
        f"{settings.FRONTEND_URL}/dashboard/bookings?booking={booking.pk}",
    ]
    return "\n".join(line for line in lines if line is not None)
