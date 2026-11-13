"""Writing one sign-in attempt to the log.

READ THIS FIRST
===============

record(request, status=..., method=..., user=..., identifier=...) is the ONE
function every sign-in path calls. It:

  1. reads the visitor's IP address safely        (client.py)
  2. reads the browser / OS / device              (client.py)
  3. fingerprints the session with a short hash   (never the key itself)
  4. applies the security rules to the attempt    (security.py)
  5. saves the row
  6. queues the place lookup, which fills in country / city / coordinates a
     moment later and re-checks the rules with that extra knowledge
     (tasks.py). The lookup is NOT done here: a slow geolocation service must
     never make signing in slow.

record() NEVER RAISES. A log that can break signing in is worse than a log with
a gap in it, so every failure is logged (without personal details) and
swallowed - the same trade accounts/events.py record_event makes.

WHO CALLS IT
------------
  * signals.py  - Django's "user_logged_in" and "user_login_failed" signals.
                  They fire for the API login, Django's own /admin/ login, and
                  every code/PIN sign-in that ends in login(). Using the
                  signals means the existing authentication is not changed or
                  replaced: it is only listened to.
  * accounts/views.py - the wrong-PIN and wrong-code branches, which fail
                  without going through Django's authenticate() and so never
                  fire a signal.
"""

import hashlib
import logging

from django.db import transaction
from django.utils import timezone

from . import security
from .client import client_ip, describe_user_agent
from .models import LoginActivity

logger = logging.getLogger(__name__)

# What the sign-in method is called, by the URL the request came in on. Anything
# else is a plain e-mail + password sign-in.
_METHODS = (
    ("/admin/", "django_admin"),
    ("/api/auth/code-login/", "email_code"),
    ("/api/auth/pin-login/", "pin"),
    ("/api/auth/warehouse-login/", "email_pin"),
)


def method_for(request):
    """"password", "email_code", "pin", ... from the address that was called."""
    path = getattr(request, "path", "") or ""
    for prefix, name in _METHODS:
        if path.startswith(prefix):
            return name
    return "password"


def _session_hash(request):
    """A short one-way fingerprint of the session, or "".

    The session key itself is a credential and is never stored; 16 hex
    characters of its SHA-256 are enough to tell two sessions apart and cannot
    be turned back into a key.
    """
    session = getattr(request, "session", None)
    key = getattr(session, "session_key", None)
    if not key:
        return ""
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def record(request, *, status, method="", user=None, identifier=""):
    """Log one attempt. Returns the LoginActivity row, or None if it failed."""
    try:
        meta = getattr(request, "META", {}) or {}
        agent = describe_user_agent(meta.get("HTTP_USER_AGENT", ""))

        if user is not None and not identifier:
            identifier = user.email or user.get_username()

        activity = LoginActivity(
            user=user if (user is not None and getattr(user, "pk", None)) else None,
            identifier=(identifier or "")[:254],
            ip_address=client_ip(request),
            status=status,
            method=method or method_for(request),
            session_hash=_session_hash(request) if status == LoginActivity.Status.SUCCESS else "",
            created_at=timezone.now(),
            **agent,
        )

        # The rules that do not need the place yet. The place lookup repeats
        # them once it knows the country.
        activity.security_status, activity.flags = security.evaluate(activity)
        activity.save()

        _queue_location_lookup(activity.pk)
        return activity
    except Exception:  # noqa: BLE001 - see "NEVER RAISES" above
        logger.exception("Could not record a sign-in attempt.")
        return None


def _queue_location_lookup(activity_id):
    """Look the place up on a worker, once the row is safely saved."""

    def send():
        # Imported here: tasks.py imports models, and at import time Celery's
        # autodiscovery is still walking the app list.
        from .tasks import locate_login_activity

        try:
            locate_login_activity.delay(activity_id)
        except Exception:  # noqa: BLE001 - the row exists; only the place is lost
            logger.warning("Could not queue the place lookup for sign-in %s.", activity_id)

    transaction.on_commit(send)
