"""Looking up where a sign-in came from, off the request path.

Queued by loginactivity/recorder.py once the row is saved. Without a Celery
broker (local development) the project runs tasks right away in the same
process (settings CELERY_TASK_ALWAYS_EAGER), so this works there too - just
not in the background.
"""

import logging

from celery import shared_task

from . import geo, security
from .models import LoginActivity

logger = logging.getLogger(__name__)


@shared_task
def locate_login_activity(activity_id):
    """Fill in the place of one attempt, then apply the rules again.

    The second pass matters: "three countries within an hour" and "a country
    this account has never used" can only be judged once the country is known.
    Safe to run twice - it does nothing when the place is already there.
    """
    activity = LoginActivity.objects.filter(pk=activity_id).first()
    if activity is None or activity.has_location:
        return

    place = geo.locate(activity.ip_address)
    if not place:
        return

    for field, value in place.items():
        setattr(activity, field, value)
    status, flags = security.evaluate(activity)

    LoginActivity.objects.filter(pk=activity.pk).update(
        **place, security_status=status, flags=flags
    )
