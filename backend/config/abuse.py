"""Limits on public endpoints that do not depend on the client's address.

The per-IP throttles in settings.REST_FRAMEWORK are only as good as the
address DRF is told, and that address comes from X-Forwarded-For. When
DJANGO_NUM_PROXIES is wrong or unset - or when the backend's own hostname is
reachable directly, past the proxy that would otherwise set the header - a
client that changes the header on every request is never throttled at all.

So the endpoints that create something from an anonymous request carry a
second ceiling as well: how many of those things the whole site will accept
per hour, from everybody together. It cannot be dodged by changing an
address, because it does not look at one.

What it costs: during a flood, real visitors are turned away for the rest of
the hour along with the flood. That is the trade made deliberately - a capped
inconvenience instead of an uncapped inbox, database and media bucket - and
the ceilings are set far above what real traffic needs, so it only ever bites
during an attack.

Only successful creations count (see `record`), so a flood of malformed
requests cannot use the budget up; only requests that would really have
created a row can.
"""

from django.conf import settings
from django.core.cache import cache
from rest_framework import status
from rest_framework.exceptions import APIException

WINDOW_SECONDS = 60 * 60

# Defaults, per hour, for the whole site. Overridable with
# DJANGO_SITE_LIMIT_<NAME> (see settings.SITE_WIDE_LIMITS).
DEFAULT_LIMITS = {
    "signup": 100,
    "contact": 200,
    "quote": 200,
    "booking": 200,
    # The chat assistant: each one is a paid OpenAI call, so this is also
    # the ceiling on that bill per hour.
    "assistant": 2000,
    # The "Feedback" button on every page (feedback/views.py).
    "feedback": 300,
}


class SiteBusy(APIException):
    """429 with a sentence a form can show."""

    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_detail = (
        "We are receiving an unusual number of requests right now. "
        "Please try again in a little while."
    )
    default_code = "site_busy"


def _limit(name):
    return getattr(settings, "SITE_WIDE_LIMITS", {}).get(name, DEFAULT_LIMITS[name])


def _key(name):
    return f"site-wide:{name}"


def check(name):
    """Refuse with 429 when the site has accepted `name` too often this hour.

    Called before anything is saved. Separate from `record` so that only
    requests that went on to create something are counted.
    """
    if cache.get(_key(name), 0) >= _limit(name):
        raise SiteBusy()


def record(name):
    """Count one successful creation of `name`. The window starts at its first count."""
    key = _key(name)
    if cache.add(key, 1, WINDOW_SECONDS):
        return
    try:
        cache.incr(key)
    except ValueError:
        # The entry expired between add() and incr(): start a new window.
        cache.set(key, 1, WINDOW_SECONDS)
