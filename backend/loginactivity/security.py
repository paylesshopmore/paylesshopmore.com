"""The rules that decide whether a sign-in attempt looks worrying.

READ THIS FIRST
===============

evaluate(activity) looks at ONE attempt in the light of the attempts before it
and answers with:

    (security_status, flags)

    flags            a list of short codes saying WHY, e.g. ["many_failures_ip"]
    security_status  normal / notice / suspicious / blocked  (the worst flag)

The numbers ("5 failures", "15 minutes", "3 countries") are NOT in this file:
they are the single SecuritySettings row, which the office edits in Django's
admin. This file only holds the logic.

THE RULES
---------
  flag                    level       meaning
  ----------------------  ----------  ---------------------------------------
  blocked_ip              blocked     the address is on the block list
  many_failures_ip        suspicious  too many FAILED tries from this address
                                      in the time window
  many_failures_account   suspicious  too many FAILED tries against this
                                      account in the window (from anywhere)
  success_after_failures  suspicious  this sign-in WORKED right after the
                                      account was hit with that many failures:
                                      the classic sign of a guessed password
  many_countries          suspicious  the account was used from this many
                                      different countries within the window
  new_device              notice      a browser/OS/device this account has not
                                      used before
  new_country             notice      a country this account has not signed in
                                      from before

IMPORTANT: a NEW COUNTRY or a NEW DEVICE is only a "notice", never
"suspicious". People travel, buy new phones and use a VPN. A notice is shown to
the administrator for information; it does not count as a suspicious attempt
and nothing is blocked because of it.

"Suspicious" never blocks anybody by itself either. It only puts the row in
front of an administrator (the orange markers and the review list).

Every function here is pure reading of earlier rows: calling evaluate() twice
gives the same answer, which is why it can safely be run again once the
location has been looked up.
"""

import logging
from datetime import timedelta

from django.db.models import Q

from .models import BlockedIP, LoginActivity, SecuritySettings

logger = logging.getLogger(__name__)

# The level of every flag. The row's security_status is the worst one present.
LEVELS = {
    "blocked_ip": LoginActivity.Security.BLOCKED,
    "many_failures_ip": LoginActivity.Security.SUSPICIOUS,
    "many_failures_account": LoginActivity.Security.SUSPICIOUS,
    "success_after_failures": LoginActivity.Security.SUSPICIOUS,
    "many_countries": LoginActivity.Security.SUSPICIOUS,
    "new_device": LoginActivity.Security.NOTICE,
    "new_country": LoginActivity.Security.NOTICE,
}

# Worst first.
_ORDER = [
    LoginActivity.Security.BLOCKED,
    LoginActivity.Security.SUSPICIOUS,
    LoginActivity.Security.NOTICE,
]


def _account_filter(activity):
    """"This account", whether it was reached by id or only by typed name."""
    match = Q()
    if activity.user_id:
        match |= Q(user_id=activity.user_id)
    if activity.identifier:
        match |= Q(identifier__iexact=activity.identifier)
    return match


def is_blocked(ip):
    """Whether this address is on the block list.

    NEVER raises. This is asked BEFORE anybody is let in, so if the answer
    cannot be found (the table is missing because a migration has not been run
    yet, or the database hiccups) the safe choice for the site is to say "not
    blocked" and carry on: a security log must not be able to stop everybody,
    staff included, from signing in. The problem is logged.
    """
    if not ip:
        return False
    try:
        return BlockedIP.objects.filter(ip_address=ip).exists()
    except Exception:  # noqa: BLE001 - see above
        logger.exception("Could not check the IP block list; treating the address as not blocked.")
        return False


def evaluate(activity, thresholds=None):
    """(security_status, flags) for one attempt. See the top of this file."""
    t = thresholds or SecuritySettings.current()
    flags = []
    window_start = activity.created_at - timedelta(minutes=t.failed_window_minutes)
    failed = LoginActivity.objects.filter(
        status=LoginActivity.Status.FAILED,
        created_at__gte=window_start,
        created_at__lte=activity.created_at,
    )

    # 1. An address on the block list.
    if is_blocked(activity.ip_address):
        flags.append("blocked_ip")

    # 2. Many failures from this one address.
    if activity.ip_address and failed.filter(ip_address=activity.ip_address).count() >= t.failed_per_ip:
        flags.append("many_failures_ip")

    # 3. Many failures against this one account (and 4: it then got in).
    account = _account_filter(activity)
    if account:
        account_failures = failed.filter(account).count()
        if account_failures >= t.failed_per_account:
            flags.append("many_failures_account")
            if activity.status == LoginActivity.Status.SUCCESS:
                flags.append("success_after_failures")

        # 5. The same account in several countries within a short time.
        since = activity.created_at - timedelta(minutes=t.countries_window_minutes)
        countries = (
            LoginActivity.objects.filter(account, created_at__gte=since, created_at__lte=activity.created_at)
            .exclude(country_code="")
            .values_list("country_code", flat=True)
            .distinct()
        )
        if len(set(countries)) >= t.countries_threshold:
            flags.append("many_countries")

    # 6 and 7: only a successful sign-in of a known account can be "new" to it.
    if activity.status == LoginActivity.Status.SUCCESS and activity.user_id:
        before = LoginActivity.objects.filter(
            user_id=activity.user_id,
            status=LoginActivity.Status.SUCCESS,
            created_at__lt=activity.created_at,
        )
        history = before.count()

        # New device: needs at least one earlier sign-in to compare with.
        if history >= 1 and activity.device_label:
            known_device = before.filter(
                browser=activity.browser, os=activity.os, device_type=activity.device_type
            ).exists()
            if not known_device:
                flags.append("new_device")

        # New country: needs a little more history, or the very first sign-in
        # from anywhere would count.
        if history >= t.history_min_logins and activity.country_code:
            if not before.filter(country_code=activity.country_code).exists():
                flags.append("new_country")

    return worst(flags), flags


def worst(flags):
    """The security status for a list of flags."""
    levels = {LEVELS[flag] for flag in flags if flag in LEVELS}
    for level in _ORDER:
        if level in levels:
            return level
    return LoginActivity.Security.NORMAL
