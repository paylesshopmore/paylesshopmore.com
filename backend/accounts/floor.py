"""Signing in on a shared floor device: tap your name, type your PIN.

Workers on the warehouse floor share phones and scanners and hand them over
many times a day. An e-mailed code (signin_codes.py) for every handover is
minutes each time and needs an admin; this is seconds. An admin registers a
device once, a worker sets a four-digit PIN once (straight after signing in
with an e-mailed code), and from then on a handover is a name and four digits.

A four-digit PIN that does not change is a weak secret, so what follows is
mostly about limiting where and how often it can be tried:

  * Only on a registered device. Without the device's token every PIN request
    is refused, and the list of names is not shown either - from anywhere but
    a device an admin set up in the warehouse, a PIN is worth nothing.
  * Five wrong tries in a row lock it. The try is counted before the PIN is
    compared, in one conditional UPDATE, so fifty requests sent at once still
    get five comparisons between them (see sign_in_with_pin).
  * A device that has had DEVICE_WRONG_PIN_LIMIT wrong PINs, for anybody, in
    DEVICE_WRONG_PIN_WINDOW is refused for a while. Without it, somebody with
    the device could try four PINs against every worker in turn without locking
    anyone.
  * Only warehouse-only accounts, the same rule as the codes: the worst a
    guessed PIN opens is the scanner and the intake sheets.
  * Never returned, never logged, only hashed.

What it does not stop is somebody watching a colleague type it. That is the
real risk of a standing PIN on a busy floor, and why every PIN sign-in is
recorded with its device (FloorEvent) for an admin to look back on.
"""

import hashlib
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import FloorDevice, FloorDeviceAccess, FloorEvent, FloorLocation, User, WarehousePin
from .signin_codes import refusal_reason

logger = logging.getLogger(__name__)

PIN_LENGTH = 4

# Wrong tries in a row before a PIN locks.
MAX_PIN_ATTEMPTS = 5

# Wrong tries in total, since the PIN was set and within this window, before it
# locks - however many correct sign-ins came in between.
#
# MAX_PIN_ATTEMPTS alone resets on every correct PIN. A colleague at a floor
# device could then try four guesses after each of the owner's sign-ins, every
# day, and over months that adds up against the 9,900 or so PINs allowed. This
# ceiling does not reset on success, only when a new PIN is set.
MAX_PIN_WRONG_IN_WINDOW = 10
PIN_WRONG_WINDOW = timedelta(days=30)

# Wrong PINs, for any worker, one device may have in the window before it is
# refused for the rest of it. Generous for fumbling thumbs; a ceiling on
# trying four PINs against everybody on the list.
DEVICE_WRONG_PIN_LIMIT = 10
DEVICE_WRONG_PIN_WINDOW = timedelta(minutes=15)

# The device's token lives in this cookie: HttpOnly, so no script on the page
# can read it, and long-lived, because a device is registered once. Browsers
# cap a cookie at 400 days; it is set again on every PIN sign-in, so a device
# in use never reaches that.
DEVICE_COOKIE = "plsm_floor_device"
DEVICE_COOKIE_AGE = 400 * 24 * 60 * 60

# Set in the session once a warehouse worker has shown it is them for the
# floor: a sign-in with an e-mailed code or a PIN, or - after signing in with a
# password like a customer - their e-mail and PIN on the profile page.
# staff.permissions.IsWarehouseOrStaff refuses a warehouse-only account without
# it, so a password alone opens the customer profile and nothing more.
WAREHOUSE_UNLOCKED_KEY = "warehouse_unlocked"

# Set in the session by a sign-in with an e-mailed code, spent by setting a
# PIN. A PIN can only be set by somebody who just proved they read that
# worker's mail - not by whoever is holding a device somebody left signed in.
MAY_SET_PIN_KEY = "may_set_pin"


class PinRefused(Exception):
    """A PIN cannot be set. The message says why, in words for the worker."""


class DeviceCoolingOff(Exception):
    """This device has had too many wrong PINs lately to try another."""


def _token_digest(token):
    # Plain SHA-256 is right for a 256-bit random token: there is nothing to
    # brute-force, so a slow hash would only make every request slower.
    return hashlib.sha256(token.encode()).hexdigest()


# ------------------------------------------------------------------ devices


def register_device(name, registered_by):
    """A new floor device. Returns (device, token); the token goes into the
    cookie and nowhere else."""
    token = secrets.token_urlsafe(32)
    device = FloorDevice.objects.create(
        name=name, token_hash=_token_digest(token), created_by=registered_by
    )
    return device, token


def device_for(request):
    """The registered, unrevoked device this request comes from, or None."""
    token = request.COOKIES.get(DEVICE_COOKIE)
    if not token:
        return None
    return FloorDevice.objects.filter(
        token_hash=_token_digest(token), revoked_at__isnull=True
    ).first()


def remember_device(response, request):
    """Set the device cookie again from the one the request carried, so a
    device in daily use never reaches the browser's cap on its age."""
    token = request.COOKIES.get(DEVICE_COOKIE)
    if token:
        set_device_cookie(response, token)


def set_device_cookie(response, token):
    response.set_cookie(
        DEVICE_COOKIE,
        token,
        max_age=DEVICE_COOKIE_AGE,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        # The same as the session cookie, for the same reason: if the API is on
        # another site the browser must still send it (see settings.py).
        samesite=settings.SESSION_COOKIE_SAMESITE,
    )


def touch(device):
    FloorDevice.objects.filter(pk=device.pk).update(last_seen_at=timezone.now())


def revoke_device(device, revoked_by):
    FloorDevice.objects.filter(pk=device.pk, revoked_at__isnull=True).update(
        revoked_at=timezone.now(), revoked_by=revoked_by
    )


# ------------------------------------------------------------------ locations


def locations_in_use():
    """Whether any FloorLocation exists. Until one does, devices are not
    limited by location at all - see FloorLocation for why."""
    return FloorLocation.objects.exists()


def device_sections(device):
    """The warehouse sections this device may be used for: the union of the
    sections of every location it has been granted."""
    allowed = set()
    for sections in FloorLocation.objects.filter(device_grants__device=device).values_list(
        "sections", flat=True
    ):
        allowed.update(sections or [])
    return allowed


def device_allows(device, section):
    """May this floor device be used for this warehouse section?

    Deny by default once locations are in use: a device with no grant, or
    whose granted locations do not include the section, is refused. Before
    the first location exists, everything is allowed, as it always was.
    """
    if not locations_in_use():
        return True
    return section in device_sections(device)


def grant_location(device, location, granted_by):
    """Let `device` be used in `location`. Returns False if it already was.

    Recorded in the floor audit trail (FloorEvent) with the admin's name.
    """
    with transaction.atomic():
        _, created = FloorDeviceAccess.objects.get_or_create(
            device=device, location=location, defaults={"granted_by": granted_by}
        )
        if created:
            FloorEvent.objects.create(
                kind=FloorEvent.Kind.ACCESS_GRANTED,
                device=device,
                actor=granted_by,
                location=location,
                location_name=location.name,
            )
    return created


def revoke_location(device, location, revoked_by):
    """Stop `device` being used in `location`, at once. Returns False if it
    was not granted. The next request from the device is checked against
    the database again, so nothing has to wait for a session to end."""
    with transaction.atomic():
        deleted, _ = FloorDeviceAccess.objects.filter(device=device, location=location).delete()
        if deleted:
            FloorEvent.objects.create(
                kind=FloorEvent.Kind.ACCESS_REVOKED,
                device=device,
                actor=revoked_by,
                location=location,
                location_name=location.name,
            )
    return bool(deleted)


# ------------------------------------------------------------------ the list


def _short_name(user):
    """First name and last initial: enough to find yourself on a list, not a
    staff directory for whoever picks the device up."""
    first = (user.first_name or "").strip()
    last = (user.last_name or "").strip()
    if not first:
        return f"Worker {user.pk}"
    return f"{first} {last[0]}." if last else first


def roster():
    """Who may sign in on a floor device, for the "Who is working?" screen."""
    workers = [
        user
        for user in User.objects.filter(
            role=User.Role.WAREHOUSE,
            is_active=True,
            is_warehouse=True,
            is_staff=False,
            is_superuser=False,
            anonymised_at__isnull=True,
        )
        .select_related("warehouse_pin")
        .order_by("first_name", "last_name", "pk")
        if refusal_reason(user) is None
    ]

    names = [_short_name(user) for user in workers]
    rows = []
    for user, name in zip(workers, names, strict=True):
        pin = getattr(user, "warehouse_pin", None)
        rows.append(
            {
                "id": user.pk,
                # Two Wim T.s get their numbers, so neither taps the other.
                "name": f"{name} (#{user.pk})" if names.count(name) > 1 else name,
                "has_pin": pin is not None,
                "locked": bool(pin and pin.locked_at),
            }
        )
    return rows


# ------------------------------------------------------------------ PINs


def weak_pin_reason(pin):
    """Why `pin` is not allowed, or None.

    The first PINs anybody tries: one digit four times, a straight run up or
    down, and two digits repeated. Refusing them takes the easiest few hundred
    guesses' worth of luck out of the five a locked PIN allows.
    """
    if len(pin) != PIN_LENGTH or not pin.isdigit():
        return "A PIN is exactly four digits."
    digits = [int(d) for d in pin]
    steps = {b - a for a, b in zip(digits, digits[1:])}
    if steps in ({0}, {1}, {-1}):
        return "That PIN is too easy to guess. Avoid repeats and runs like 1234."
    if pin[:2] == pin[2:] or (pin[0] == pin[1] and pin[2] == pin[3]):
        return "That PIN is too easy to guess. Avoid repeats and runs like 1234."
    return None


def set_pin(user, pin):
    """Give `user` this PIN, replacing any old one and clearing a lock."""
    reason = refusal_reason(user)
    if reason:
        raise PinRefused(reason)
    reason = weak_pin_reason(pin)
    if reason:
        raise PinRefused(reason)

    # A worker replacing a PIN a manager generated must pick a different one:
    # the generated PIN has been seen by somebody else, which is the whole
    # reason it has to change.
    current = WarehousePin.objects.filter(user=user).first()
    if current and current.must_change and check_password(pin, current.pin_hash):
        raise PinRefused("Choose a new PIN, not the one you were given.")

    WarehousePin.objects.update_or_create(
        user=user,
        defaults={
            "pin_hash": make_password(pin),
            "set_at": timezone.now(),
            "failed_attempts": 0,
            "locked_at": None,
            "must_change": False,
        },
    )
    FloorEvent.objects.create(kind=FloorEvent.Kind.PIN_SET, user=user)


def generate_pin():
    """A random PIN that passes weak_pin_reason.

    secrets, not random: random is predictable from its earlier output, and
    this is a secret. Drawn again until it is not an easy one like 1111 or
    1234 - a few hundred of the ten thousand, so this loops once or twice at
    most.
    """
    while True:
        pin = f"{secrets.randbelow(10 ** PIN_LENGTH):0{PIN_LENGTH}d}"
        if weak_pin_reason(pin) is None:
            return pin


def issue_pin(user, issued_by):
    """Give `user` a new random PIN and return it, in plain text, ONCE.

    For a manager handing a worker their first PIN, or a replacement for one
    that was forgotten, locked or seen by somebody else. The old PIN stops
    working immediately (replaced in the same row), a lock is cleared, and
    the new one is marked must_change: the worker chooses their own straight
    after signing in with it.

    The plain PIN exists only in the return value. Only its hash is stored,
    it is never logged, and nothing can show it again - a lost one is
    replaced by issuing another.
    """
    reason = refusal_reason(user)
    if reason:
        raise PinRefused(reason)

    pin = generate_pin()
    with transaction.atomic():
        WarehousePin.objects.update_or_create(
            user=user,
            defaults={
                "pin_hash": make_password(pin),
                "set_at": timezone.now(),
                "failed_attempts": 0,
                "locked_at": None,
                "must_change": True,
            },
        )
        FloorEvent.objects.create(kind=FloorEvent.Kind.PIN_ISSUED, user=user, actor=issued_by)
    return pin


def must_change_pin(user):
    """Whether `user` is still on a PIN a manager generated."""
    return WarehousePin.objects.filter(user=user, must_change=True).exists()


def reset_pin(user, reset_by):
    """Take a worker's PIN away. They set a new one after an e-mailed code."""
    with transaction.atomic():
        deleted, _ = WarehousePin.objects.filter(user=user).delete()
        if deleted:
            FloorEvent.objects.create(
                kind=FloorEvent.Kind.PIN_RESET, user=user, actor=reset_by
            )
    return bool(deleted)


def device_is_cooling_off(device):
    since = timezone.now() - DEVICE_WRONG_PIN_WINDOW
    wrong = FloorEvent.objects.filter(
        device=device,
        kind__in=[FloorEvent.Kind.WRONG_PIN, FloorEvent.Kind.PIN_LOCKED],
        created_at__gte=since,
    ).count()
    return wrong >= DEVICE_WRONG_PIN_LIMIT


def sign_in_with_pin(device, user_id, pin):
    """The worker `user_id` if `pin` is theirs, on this device; None otherwise.

    None for every failure - nobody by that id, not a warehouse worker, no PIN
    set, locked, wrong - so the caller cannot tell them apart. Raises
    DeviceCoolingOff before anything is counted when the device has had too
    many wrong PINs lately.
    """
    pin = (pin or "").strip()
    if len(pin) != PIN_LENGTH or not pin.isdigit():
        return None

    if device_is_cooling_off(device):
        raise DeviceCoolingOff()

    user = User.objects.filter(pk=user_id).first() if str(user_id).isdigit() else None
    if user is None or refusal_reason(user):
        return None

    return user if pin_matches(user, pin, device) else None


def sign_in_with_email(email, pin, device=None):
    """The worker with this e-mail address if `pin` is theirs; None otherwise.

    /warehouse/login on a computer that is not a registered floor device,
    where the "Who is working?" list is not shown (it would hand anybody who
    finds the page a list of whom to try). Typed e-mail instead of a tapped
    name; everything else is the same as sign_in_with_pin - the same five
    tries per PIN, the same 30-day ceiling, and one None for every way it
    fails, so the answer never says whether an address works here.

    `device` when there is one anyway, so its cooling-off applies too. The
    view adds a per-address throttle on top (settings 'warehouse_login').
    """
    pin = (pin or "").strip()
    email = (email or "").strip()
    if len(pin) != PIN_LENGTH or not pin.isdigit() or not email:
        return None

    if device is not None and device_is_cooling_off(device):
        raise DeviceCoolingOff()

    user = User.objects.filter(email__iexact=email).first()
    if user is None or refusal_reason(user):
        # Hash something anyway, so an unknown address takes as long to
        # refuse as a wrong PIN - otherwise the time taken would tell which
        # addresses belong to a warehouse worker.
        make_password(pin)
        return None

    return user if pin_matches(user, pin, device) else None


def unlock_with_pin(user, email, pin, device=None):
    """Whether a warehouse worker already signed in with a password may open
    the warehouse: their own e-mail address and their PIN.

    The second step after a password, so unlike sign_in_with_pin it does not
    need a registered device - the password has already shown who this is,
    and the PIN shows it is still them at the warehouse door. The address must
    be the signed-in account's own: this cannot open the warehouse for anyone
    else. Counted against the same five tries as every other use of the PIN.
    """
    pin = (pin or "").strip()
    email = (email or "").strip()
    if len(pin) != PIN_LENGTH or not pin.isdigit() or refusal_reason(user):
        return False
    if not email or email.lower() != (user.email or "").lower():
        return False
    if device is not None and device_is_cooling_off(device):
        raise DeviceCoolingOff()
    return pin_matches(user, pin, device)


def pin_matches(user, pin, device=None):
    """Whether `pin` is `user`'s PIN, counting the try against the lockout.

    The try is counted before the PIN is compared, in a single UPDATE that
    only succeeds while the PIN is unlocked and has tries left - the same
    reasoning as signin_codes.redeem_code. Counting after would let somebody
    send fifty guesses at once, each reading "no wrong tries yet". Here the
    database hands out at most MAX_PIN_ATTEMPTS tickets between right
    answers, however many requests arrive together.
    """
    live = WarehousePin.objects.filter(user=user, locked_at__isnull=True)
    ticket = live.filter(failed_attempts__lt=MAX_PIN_ATTEMPTS).update(
        failed_attempts=F("failed_attempts") + 1
    )
    if not ticket:
        return False

    row = WarehousePin.objects.get(user=user)
    if check_password(pin, row.pin_hash):
        WarehousePin.objects.filter(pk=row.pk).update(failed_attempts=0)
        return True

    if row.failed_attempts >= MAX_PIN_ATTEMPTS:
        locked = WarehousePin.objects.filter(pk=row.pk, locked_at__isnull=True).update(
            locked_at=timezone.now()
        )
        if locked:
            # Either a worker fumbling five times or somebody guessing; an
            # admin will be asked for a code either way. The user id only.
            logger.warning(
                "Warehouse PIN for user %s locked after %s wrong tries on device %s.",
                user.pk,
                MAX_PIN_ATTEMPTS,
                device.pk if device else None,
            )
            FloorEvent.objects.create(
                kind=FloorEvent.Kind.PIN_LOCKED, user=user, device=device
            )
            return False

    FloorEvent.objects.create(kind=FloorEvent.Kind.WRONG_PIN, user=user, device=device)

    # The longer ceiling, which a correct sign-in does not reset: counted
    # since this PIN was set (a new PIN starts clean) and within the window.
    since = max(row.set_at, timezone.now() - PIN_WRONG_WINDOW)
    wrong_lately = FloorEvent.objects.filter(
        user=user, kind=FloorEvent.Kind.WRONG_PIN, created_at__gte=since
    ).count()
    if wrong_lately >= MAX_PIN_WRONG_IN_WINDOW:
        locked = WarehousePin.objects.filter(pk=row.pk, locked_at__isnull=True).update(
            locked_at=timezone.now()
        )
        if locked:
            logger.warning(
                "Warehouse PIN for user %s locked after %s wrong tries in %s days.",
                user.pk,
                wrong_lately,
                PIN_WRONG_WINDOW.days,
            )
            FloorEvent.objects.create(kind=FloorEvent.Kind.PIN_LOCKED, user=user, device=device)
    return False
