"""E-mailing the office about new feedback, on a worker.

Queued from feedback/views.py once the feedback is saved. Shaped like
bookings/tasks.py: claim the row first (office_emailed_at), then send, so a
retried job never mails the same feedback twice.

Sent to settings.FEEDBACK_NOTIFY_EMAILS (DJANGO_FEEDBACK_NOTIFY_EMAILS; the
office's mailbox by default). "Reply" in the office's mail client writes to
whoever sent it, when we know their address.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMessage
from django.utils import timezone

from .models import Feedback

logger = logging.getLogger(__name__)


def subject_for(feedback):
    stars = "★" * feedback.rating + "☆" * (5 - feedback.rating)
    if feedback.kind == Feedback.Kind.DELIVERY:
        tracking = feedback.package.tracking_number if feedback.package else "?"
        return f"Delivery review {stars} ({tracking})"
    return f"Website feedback {stars}"


def sender_address(feedback):
    """Who wrote it, if we can answer them."""
    if feedback.user and feedback.user.email:
        return feedback.user.email
    return feedback.email or ""


def body_for(feedback):
    """Plain text, like the site's other e-mails."""
    user = feedback.user
    who = (user.get_full_name() or user.email) if user else "A visitor (not signed in)"
    lines = [
        f"{feedback.get_kind_display()} - {feedback.rating} out of 5 stars",
        "",
        f"From: {who}",
    ]
    address = sender_address(feedback)
    if address:
        lines.append(f"E-mail: {address}")
    if feedback.kind == Feedback.Kind.DELIVERY and feedback.package:
        lines.append(f"Shipment: {feedback.package.tracking_number}")
    if feedback.page:
        lines.append(f"Page: {settings.FRONTEND_URL}{feedback.page}")
    if feedback.language:
        lines.append(f"Language: {feedback.language}")
    lines += [
        "",
        "Comment:",
        feedback.comment or "(no comment)",
        "",
        "All feedback, and \"Mark handled\":",
        f"{settings.FRONTEND_URL}/dashboard/feedback",
    ]
    return "\n".join(lines)


@shared_task(
    bind=True,
    # Transient mail-server trouble is worth another go and clears on its own.
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def send_feedback_email(self, feedback_id):
    """Mail the office that feedback `feedback_id` has come in."""
    feedback = Feedback.objects.select_related("user", "package").filter(pk=feedback_id).first()
    if feedback is None:
        return

    addresses = list(getattr(settings, "FEEDBACK_NOTIFY_EMAILS", []))
    if not addresses:
        logger.warning(
            "Feedback %s came in, but nobody is set to be told (DJANGO_FEEDBACK_NOTIFY_EMAILS).", feedback_id
        )
        return

    # Claim it: only one job ever sends this one.
    claimed = Feedback.objects.filter(pk=feedback.pk, office_emailed_at__isnull=True).update(
        office_emailed_at=timezone.now()
    )
    if not claimed:
        return

    reply_to = sender_address(feedback)
    message = EmailMessage(
        subject=subject_for(feedback),
        body=body_for(feedback),
        to=addresses,
        reply_to=[reply_to] if reply_to else None,
    )
    try:
        message.send(fail_silently=False)
    except Exception:
        # Released, so the retry can still send it.
        Feedback.objects.filter(pk=feedback.pk).update(office_emailed_at=None)
        raise
