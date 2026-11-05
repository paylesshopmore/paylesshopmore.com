"""Telling the office about a new booking, on a worker.

Queued from bookings/views.py through transaction.on_commit, once the booking
is saved. Shaped like warehouse/tasks.py: claim the row first, then send, so
a retried job never mails the same booking twice.
"""

import logging

from celery import shared_task
from django.core.mail import EmailMessage
from django.utils import timezone

from .models import Booking
from .notify import body_for, recipients, subject_for

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    # Transient mail-server trouble is worth another go and clears on its own.
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def send_new_booking_email(self, booking_id):
    """Mail the office that booking `booking_id` has come in."""
    booking = (
        Booking.objects.select_related("user")
        .prefetch_related("orders__products", "orders__screenshots")
        .filter(pk=booking_id)
        .first()
    )
    if booking is None:
        logger.info("Booking %s no longer exists; nothing to e-mail.", booking_id)
        return

    addresses = recipients()
    if not addresses:
        logger.warning(
            "Booking %s came in, but nobody is set to be told. Set "
            "DJANGO_BOOKING_NOTIFY_EMAILS.",
            booking_id,
        )
        return

    claimed = Booking.objects.filter(pk=booking.pk, office_emailed_at__isnull=True).update(
        office_emailed_at=timezone.now()
    )
    if not claimed:
        logger.info("Booking %s has already been e-mailed to the office.", booking_id)
        return

    message = EmailMessage(
        subject=subject_for(booking),
        body=body_for(booking),
        to=addresses,
        # "Reply" in the office's mail client writes to the sender.
        reply_to=[booking.sender_email] if booking.sender_email else None,
    )
    try:
        message.send(fail_silently=False)
    except Exception:
        # Released, so the retry (or a later one) can still send it.
        Booking.objects.filter(pk=booking.pk).update(office_emailed_at=None)
        raise

    logger.info("Booking %s e-mailed to %d office address(es).", booking_id, len(addresses))
