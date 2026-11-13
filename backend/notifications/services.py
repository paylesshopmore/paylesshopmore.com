"""Raising a notification, and getting the e-mail on its way.

Called from the two places a customer-visible event actually happens:
Invoice.mark_sent() and PackageViewSet.perform_update(). Functions rather than
post_save signals, for the reasons invoicing/services.py sets out at length —
Package.save() runs for plenty of reasons that are not news, and a signal would
have to guess which ones were.

Every function here follows the same shape: write the row inside the caller's
transaction, then queue the e-mail with transaction.on_commit so the worker
cannot read a notification that has not landed yet.
"""

import logging

from django.db import transaction

from .models import Notification

logger = logging.getLogger(__name__)


def _queue_email(notification):
    """Hand the e-mail to a worker once the surrounding transaction commits.

    Failures to *queue* are swallowed, for the same reason approving an invoice
    swallows them: this runs from an on_commit hook, after the event it is
    about is already committed, so raising here would report a status change or
    an invoice send as a 500 when it plainly succeeded. The notification row is
    written either way, so the customer still sees it in their profile — only
    the copy in their inbox is lost, and `emailed_at` stays null to say so.
    """

    def send():
        # Imported at call time: tasks.py imports this module's models, and at
        # import time Celery's autodiscovery is still walking the app list.
        from .tasks import send_notification_email

        try:
            send_notification_email.delay(notification.pk)
        except Exception:
            logger.exception(
                "Notification %s was created but its e-mail could not be queued.",
                notification.pk,
            )

    transaction.on_commit(send)


def notify_invoice_sent(invoice):
    """Tell the customer their invoice is ready to download.

    Raised from Invoice.mark_sent(), which is a conditional UPDATE that can only
    succeed once — so this runs exactly once per invoice and needs no guard of
    its own against a second copy.
    """
    package = invoice.package

    # Imported here rather than at module scope: pdf.py imports reportlab, and
    # this module is imported by accounts and staff code that has no business
    # loading a PDF engine to send an e-mail.
    from invoicing.pdf import invoice_number

    notification = Notification.objects.create(
        user=package.user,
        kind=Notification.Kind.INVOICE_SENT,
        invoice=invoice,
        package=package,
        context={
            "invoice_number": invoice_number(invoice),
            "tracking_number": package.tracking_number,
        },
    )

    _queue_email(notification)
    return notification


def notify_shipment_received(package):
    """Tell the customer the warehouse has their goods.

    The first step of the customer's timeline ("Received at our warehouse",
    accounts/public.py) is the warehouse's own doing rather than a status the
    office sets, so notify_shipment_status never sees it. Called once, by
    accounts.warehouse.move_warehouse_stage, the moment a package is first
    received. Returns the notification, or None for a package with no owner.
    """
    if package.user_id is None:
        return None

    notification = Notification.objects.create(
        user=package.user,
        kind=Notification.Kind.SHIPMENT_STATUS,
        package=package,
        context={
            "tracking_number": package.tracking_number,
            # Not a Package.Status: a step of the public timeline. The e-mail
            # wording and the React app both know it (notifications/messages.py,
            # `notifications.status.received` in translations.js).
            "status": "received",
            "previous_status": package.status,
        },
    )

    _queue_email(notification)
    return notification


def notify_item_received(row):
    """Tell the customer an admin confirmed that something they ordered has
    arrived at the warehouse (the "Product ontvangen" / "Bestelling ontvangen"
    buttons on Dashboard -> Bookings, staff/views.py BookingViewSet).

    `row` is a BookingProduct (one item) or a BookingOrder (everything from one
    store). One notification per press: the caller only calls this when the
    press really changed the row from "not received" to "received", so a
    double-click or a retry never produces a second one.

    It is a "shipment status" notification with its own status code, the same
    way courier news is ("courier_delivered", tracking/sync.py). The facts go
    in `context`; the words are made later (notifications/messages.py for the
    e-mail, notificationText.js for the bell). Returns the notification, or
    None when the booking has no customer account (it was sent without
    signing in), so there is nobody to tell.
    """
    # A product knows its order; a store order is the row itself.
    is_product = hasattr(row, "order")
    booking = row.booking
    if booking.user_id is None:
        return None

    package = booking.package
    notification = Notification.objects.create(
        user=booking.user,
        kind=Notification.Kind.SHIPMENT_STATUS,
        package=package,
        context={
            # The shipment's number once there is one, else the booking's.
            "tracking_number": (package.tracking_number if package else booking.shipping_number) or "",
            "status": "item_received" if is_product else "order_received",
            "shop": row.order.shop_name if is_product else row.shop_name,
            # What was received: the product, or the store order's description.
            "item": row.description,
        },
    )

    _queue_email(notification)
    return notification


def notify_shipment_status(package, previous_status):
    """Tell the customer their shipment has moved.

    `previous_status` is what it was before the save, and a status that has not
    actually changed raises nothing — entering a state is the event, being in it
    is not. That is the same before-and-after comparison the caller already
    makes to stamp shipped_at, and the same one that stops every later edit to a
    package from being announced as news.

    Returns the notification, or None when there was nothing to say.
    """
    if package.status == previous_status:
        return None

    notification = Notification.objects.create(
        user=package.user,
        kind=Notification.Kind.SHIPMENT_STATUS,
        package=package,
        context={
            "tracking_number": package.tracking_number,
            "status": package.status,
            "previous_status": previous_status,
        },
    )

    _queue_email(notification)
    return notification
