"""Two-factor sign-in (2FA) with an authenticator app, controlled by an admin.

READ THIS FIRST
===============

1. THE ADMIN DECIDES HOW STRICT IT IS (TwoFactorPolicy, one row)

       disabled         nobody is asked. The sign-in works exactly as before.
       optional         people MAY turn it on (profile page). Those who did are
                        asked for a code; everybody else signs in as before.
       required_admins  every administrator (role "admin", and superusers) AND
                        every warehouse manager (role "manager") MUST
                        use it. Everybody else: as "optional".
       required_all     everybody who signs in with a password MUST use it.

   No row yet (fresh database, local development) = "disabled".

   Two settings from the environment can only make it STRICTER, never looser:
       DJANGO_TWO_FACTOR_MINIMUM_MODE   e.g. "required_admins" in production,
                                        so the dashboard can never go below it.
       DJANGO_TWO_FACTOR_FORCE_DISABLED a development switch. It only works
                                        while DEBUG is on; in production it is
                                        ignored (and config/checks.py warns).

2. HOW A SIGN-IN GOES WHEN A CODE IS NEEDED

       password  ->  signed in, but this session is "not verified yet"
                     (TwoFactorMiddleware lets it do almost nothing)
                 ->  6-digit code (or a recovery code)  ->  verified
       Not set up yet but required?  ->  setup screen first (scan QR code,
                                         type the first code, save 10
                                         recovery codes)  ->  verified

   The server enforces it (accounts/middleware.py TwoFactorMiddleware), for
   the dashboard API and Django's /admin/ alike. The browser only follows.

   Floor sign-ins are not asked: a warehouse worker signing in with an
   e-mailed code or with a PIN on a registered floor device already proves
   something they have, on top of something they know.

3. THE CODE ITSELF (TOTP, RFC 6238 - what every authenticator app does)

       step = seconds since 1970 // 30
       hash = HMAC-SHA1(secret, step as 8 bytes)
       code = 6 digits cut from that hash ("dynamic truncation")

   Example: the RFC's test secret "12345678901234567890" at 59 seconds gives
   287082 (test_twofactor.py checks exactly that). The slot before and after
   are accepted too (a phone clock a few seconds off), a slot at or before the
   last one used never is (a code works once), and older slots are "expired".

4. SAFETY NETS
   - Secrets are encrypted in the database (twofactor_crypto.py).
   - Recovery codes are stored as slow salted hashes, shown once.
   - Five wrong codes pause the account for 15 minutes.
   - Every change is written to TwoFactorAuditEvent. Never a code or secret.
   - An admin cannot make 2FA required before setting it up themselves.
   - Lost phone: a recovery code; or another admin presses "Reset 2FA" on the
     Workers page; or, for the last admin, `python manage.py reset_two_factor
     <email>` on the server. There is no public bypass of any kind.
"""

import base64
import hashlib
import hmac
import logging
import secrets
import struct
import time
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.crypto import constant_time_compare

from . import twofactor_crypto
from .models import (
    TwoFactorAuditEvent,
    TwoFactorDevice,
    TwoFactorPolicy,
    TwoFactorRecoveryCode,
)

logger = logging.getLogger(__name__)

Mode = TwoFactorPolicy.Mode
# Strictness order, used to apply DJANGO_TWO_FACTOR_MINIMUM_MODE.
STRICTNESS = [Mode.DISABLED, Mode.OPTIONAL, Mode.REQUIRED_ADMINS, Mode.REQUIRED_ALL]

# The session remembers "this session passed two-factor for user N". The id,
# not just True, so it can never carry over to another account.
VERIFIED_KEY = "two_factor_verified_user"

STEP_SECONDS = 30
DIGITS = 6
ISSUER = "PayLesShopMore"

RECOVERY_CODE_COUNT = 10
# No 0/o or 1/l/i: a recovery code is read off paper and typed by hand.
RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

MAX_FAILURES = 5
FAILURE_WINDOW_SECONDS = 15 * 60

POLICY_CACHE_KEY = "two-factor-policy-mode"
POLICY_CACHE_SECONDS = 30


# ---- 1. the policy -------------------------------------------------------------------


def stored_mode():
    """The mode the admin chose (cached for 30 s; saving clears the cache)."""
    mode = cache.get(POLICY_CACHE_KEY)
    if mode is None:
        row = TwoFactorPolicy.objects.filter(pk=1).first()
        mode = row.mode if row else Mode.DISABLED
        cache.set(POLICY_CACHE_KEY, mode, POLICY_CACHE_SECONDS)
    return mode


def minimum_mode():
    """DJANGO_TWO_FACTOR_MINIMUM_MODE, or "disabled" when unset or unknown."""
    value = getattr(settings, "TWO_FACTOR_MINIMUM_MODE", "") or Mode.DISABLED
    return value if value in STRICTNESS else Mode.DISABLED


def force_disabled():
    """The development switch: only ever honoured while DEBUG is on."""
    return bool(settings.DEBUG and getattr(settings, "TWO_FACTOR_FORCE_DISABLED", False))


def effective_mode():
    """What is actually enforced: the stricter of the admin's choice and the
    environment's minimum (unless the development switch is on, locally)."""
    if force_disabled():
        return Mode.DISABLED
    chosen, floor = stored_mode(), minimum_mode()
    return chosen if STRICTNESS.index(chosen) >= STRICTNESS.index(floor) else floor


def is_admin_account(user):
    """A management account: an admin, a superuser, or a warehouse manager.

    These accounts can open, switch off and hand PINs to other accounts, so
    "required for administrators" asks all of them for a second factor.
    """
    return bool(user.is_superuser or getattr(user, "role", None) in ("admin", "manager"))


def is_floor_session(request):
    """A warehouse worker signed in on the floor (e-mailed code or PIN)."""
    from .floor import WAREHOUSE_UNLOCKED_KEY

    return bool(
        getattr(request.user, "is_warehouse_worker_only", False)
        and request.session.get(WAREHOUSE_UNLOCKED_KEY)
    )


def is_required_for(user, mode=None):
    """Whether this account MUST use two-factor under `mode` (default: now)."""
    mode = mode or effective_mode()
    if mode == Mode.REQUIRED_ALL:
        return True
    return mode == Mode.REQUIRED_ADMINS and is_admin_account(user)


def available():
    """Whether two-factor exists at all right now (anything but disabled)."""
    return effective_mode() != Mode.DISABLED


# ---- 2. where a session stands -----------------------------------------------------------


def confirmed_device(user):
    return TwoFactorDevice.objects.filter(user=user, confirmed_at__isnull=False).first()


def is_verified(request):
    return request.session.get(VERIFIED_KEY) == request.user.pk


def mark_verified(request):
    request.session[VERIFIED_KEY] = request.user.pk


def state(request):
    """What the browser should do next, as one word (sent with the profile):

    "off"             nothing to do (disabled, or optional and not turned on)
    "verified"        this session has passed two-factor
    "code_required"   turned on: ask for the 6-digit code
    "setup_required"  required but not set up: show the setup screen
    """
    user = request.user
    if not getattr(user, "is_authenticated", False) or not available() or is_floor_session(request):
        return "off"
    if is_verified(request):
        return "verified"
    if confirmed_device(user):
        return "code_required"
    return "setup_required" if is_required_for(user) else "off"


def must_finish(request):
    """True when this session may not do anything else until the code is in."""
    return state(request) in ("code_required", "setup_required")


# ---- 3. the maths --------------------------------------------------------------------------


def new_secret():
    """20 random bytes as base32 ("JBSWY3DP..."), the form authenticator apps read."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def code_at(secret, step):
    """The 6-digit code for one 30-second slot.

    Dynamic truncation: the last 4 bits of the hash say where to start; read
    4 bytes from there, drop the top bit, keep the last 6 decimal digits.
    """
    key = base64.b32decode(secret.upper() + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(number % 10**DIGITS).zfill(DIGITS)


def current_step(now=None):
    return int((time.time() if now is None else now) // STEP_SECONDS)


def otpauth_uri(user, secret):
    """What the QR code holds, e.g.
    otpauth://totp/PayLesShopMore:boss%40example.com?secret=JBSW...&issuer=PayLesShopMore
    """
    label = quote(f"{ISSUER}:{user.email or user.username}")
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={quote(ISSUER)}"
        f"&algorithm=SHA1&digits={DIGITS}&period={STEP_SECONDS}"
    )


def _check_totp(device, code):
    """Right for the slot before, now or after, and later than the last slot
    used? Then record the slot (so the code works once) and say yes."""
    secret = twofactor_crypto.decrypt(device.secret_encrypted)
    now = current_step()
    for step in (now - 1, now, now + 1):
        if step <= device.last_used_step:
            continue
        if constant_time_compare(code_at(secret, step), code):
            # Conditional UPDATE: of two requests racing with one code, only
            # one moves last_used_step and wins.
            won = TwoFactorDevice.objects.filter(pk=device.pk, last_used_step__lt=step).update(
                last_used_step=step
            )
            if won:
                device.last_used_step = step
            return bool(won)
    return False


# ---- 4. recovery codes -------------------------------------------------------------------------


def _normalise(code):
    """"K7WM-p3xq r9td" -> "k7wmp3xqr9td"."""
    return "".join(code.split()).replace("-", "").lower()


def new_recovery_codes(user, actor=None, request=None):
    """Replace the account's recovery codes with ten new ones and return them,
    e.g. ["k7wm-p3xq-r9td", ...]. They are never shown or stored again."""
    codes, rows = [], []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(12))
        codes.append(f"{raw[:4]}-{raw[4:8]}-{raw[8:]}")
        rows.append(TwoFactorRecoveryCode(user=user, lookup=raw[:4], code_hash=make_password(raw[4:])))
    with transaction.atomic():
        TwoFactorRecoveryCode.objects.filter(user=user).delete()
        TwoFactorRecoveryCode.objects.bulk_create(rows)
    audit(TwoFactorAuditEvent.Kind.RECOVERY_CODES_RENEWED, user=user, actor=actor or user, request=request)
    return codes


def _use_recovery_code(user, code):
    normal = _normalise(code)
    if len(normal) != 12:
        return False
    for row in TwoFactorRecoveryCode.objects.filter(user=user, lookup=normal[:4], used_at__isnull=True):
        if check_password(normal[4:], row.code_hash):
            # Conditional: a code raced twice is spent once.
            return bool(
                TwoFactorRecoveryCode.objects.filter(pk=row.pk, used_at__isnull=True).update(used_at=timezone.now())
            )
    return False


def recovery_codes_left(user):
    return TwoFactorRecoveryCode.objects.filter(user=user, used_at__isnull=True).count()


# ---- 5. too many wrong codes ---------------------------------------------------------------------


def _failure_key(user):
    return f"two-factor-failures:user-{user.pk}"


def is_locked(user):
    return cache.get(_failure_key(user), 0) >= MAX_FAILURES


def _record_failure(user, request=None):
    key = _failure_key(user)
    if cache.add(key, 1, FAILURE_WINDOW_SECONDS):
        count = 1
    else:
        try:
            count = cache.incr(key)
        except ValueError:
            cache.set(key, 1, FAILURE_WINDOW_SECONDS)
            count = 1
    if count == MAX_FAILURES:
        audit(TwoFactorAuditEvent.Kind.LOCKED_OUT, user=user, actor=user, request=request)


# ---- 6. the checks the views use ---------------------------------------------------------------------


def verify(user, code, request=None):
    """Check a sign-in code: the app's 6 digits, or a recovery code.

    Returns "ok", "wrong" or "locked". A wrong code counts towards the pause.
    """
    if is_locked(user):
        return "locked"
    device = confirmed_device(user)
    digits = "".join((code or "").split())
    ok = False
    if device is not None:
        if digits.isdigit() and len(digits) == DIGITS:
            ok = _check_totp(device, digits)
        elif _use_recovery_code(user, code or ""):
            ok = True
            audit(TwoFactorAuditEvent.Kind.RECOVERY_CODE_USED, user=user, actor=user, request=request,
                  detail={"left": recovery_codes_left(user)})
    if ok:
        cache.delete(_failure_key(user))
        return "ok"
    _record_failure(user, request)
    return "wrong"


def start_setup(user):
    """A fresh, unconfirmed secret for this account. Returns (device, plain secret).

    None when the account already has a confirmed one: knowing the password
    alone must never be enough to put a different phone on the account.
    """
    if confirmed_device(user) is not None:
        return None
    secret = new_secret()
    device, _ = TwoFactorDevice.objects.update_or_create(
        user=user,
        defaults={"secret_encrypted": twofactor_crypto.encrypt(secret), "confirmed_at": None, "last_used_step": 0},
    )
    return device, secret


def confirm_setup(user, code, request=None):
    """Finish setup: the first code from the app proves it was scanned.

    Returns "ok", "wrong", "locked" or "no_setup".
    """
    if is_locked(user):
        return "locked"
    device = TwoFactorDevice.objects.filter(user=user, confirmed_at__isnull=True).first()
    if device is None:
        return "no_setup"
    digits = "".join((code or "").split())
    if digits.isdigit() and len(digits) == DIGITS and _check_totp(device, digits):
        device.confirmed_at = timezone.now()
        device.save(update_fields=["confirmed_at", "last_used_step"])
        cache.delete(_failure_key(user))
        audit(TwoFactorAuditEvent.Kind.ENABLED, user=user, actor=user, request=request)
        return "ok"
    _record_failure(user, request)
    return "wrong"


def remove(user, kind, actor=None, request=None):
    """Take the authenticator and recovery codes off an account and sign it
    out everywhere (so every session has to pass the new rules).

    `kind`: DISABLED (by the person), RESET_BY_ADMIN or RESET_FROM_SERVER.
    """
    TwoFactorDevice.objects.filter(user=user).delete()
    TwoFactorRecoveryCode.objects.filter(user=user).delete()
    cache.delete(_failure_key(user))
    audit(kind, user=user, actor=actor, request=request)
    keep = request.session.session_key if request is not None and actor == user else None
    sign_out_everywhere(user, keep_session_key=keep)


def sign_out_everywhere(user, keep_session_key=None):
    """End every session of this account (except `keep_session_key`)."""
    user_id = str(user.pk)
    for session in Session.objects.filter(expire_date__gt=timezone.now()).iterator():
        if session.session_key != keep_session_key and session.get_decoded().get("_auth_user_id") == user_id:
            session.delete()


# ---- 7. the admin's policy, and its audit trail ----------------------------------------------------


def accounts_affected(mode):
    """Who would have to use two-factor under `mode`: [(user, has_it_set_up)].

    Shown in the confirmation before an admin makes it required, so nobody is
    surprised - and nobody is locked out without a way in: anyone without it
    is guided through setup right after their password at the next sign-in.
    """
    from .models import User

    people = User.objects.filter(is_active=True, anonymised_at__isnull=True)
    if mode == Mode.REQUIRED_ADMINS:
        people = people.filter(Q(is_superuser=True) | Q(role__in=[User.Role.ADMIN, User.Role.MANAGER]))
    elif mode != Mode.REQUIRED_ALL:
        return []
    enabled = set(
        TwoFactorDevice.objects.filter(confirmed_at__isnull=False, user__in=people).values_list("user_id", flat=True)
    )
    return [(person, person.pk in enabled) for person in people.order_by("first_name", "email")]


def change_policy(new_mode, actor, request=None):
    """Save the admin's choice, record it, and clear the cache.

    Refused (ValueError with a sentence) when it would lock the admin making
    the change out: they must have two-factor set up themselves first.
    """
    if new_mode not in STRICTNESS:
        raise ValueError("Unknown mode.")
    if is_required_for(actor, new_mode) and confirmed_device(actor) is None:
        raise ValueError(
            "Set up two-factor sign-in on your own account first (Profile -> Two-factor sign-in). "
            "Otherwise this change would lock you out."
        )
    with transaction.atomic():
        policy, _ = TwoFactorPolicy.objects.select_for_update().get_or_create(pk=1)
        old_mode = policy.mode
        policy.mode = new_mode
        policy.updated_by = actor
        policy.save()
        audit(TwoFactorAuditEvent.Kind.POLICY_CHANGED, actor=actor, request=request,
              detail={"from": old_mode, "to": new_mode})
    cache.delete(POLICY_CACHE_KEY)
    logger.warning("Two-factor policy changed from %s to %s by user %s.", old_mode, new_mode, actor.pk)
    return policy


def audit(kind, user=None, actor=None, request=None, detail=None):
    """Write one audit row. Never pass a code, a secret or a password in detail."""
    ip = None
    if request is not None:
        from config.admin_access import client_ip

        ip = client_ip(request) or request.META.get("REMOTE_ADDR")
    TwoFactorAuditEvent.objects.create(
        kind=kind, user=user, actor=actor if getattr(actor, "pk", None) else None,
        detail=detail or {}, ip_address=ip or None,
    )
