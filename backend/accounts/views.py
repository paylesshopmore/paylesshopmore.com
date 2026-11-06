"""API endpoints for the React frontend.

Session-cookie auth throughout. The browser holds an HttpOnly session cookie
it will not reveal to JavaScript, and echoes a CSRF token back in a header on
every write.
"""

import os
import time

from django.contrib.auth import login, logout, update_session_auth_hash
from django.db import transaction
from django.db.models import ProtectedError, Q
from django.http import FileResponse, Http404
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import (
    APIException,
    PermissionDenied,
    ValidationError,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle
from rest_framework.views import APIView

from config import abuse

from . import floor, lockout, reauth, twofactor
from .emails import send_handover_changed, send_password_reset
from .models import Address, FloorEvent, Package, PackageDocument, WarehousePin
from .serializers import (
    AccountDeleteSerializer,
    AddressSerializer,
    CodeLoginSerializer,
    LoginSerializer,
    PackageDocumentSerializer,
    PackageDocumentUploadSerializer,
    PackageSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    SignupSerializer,
    UserSerializer,
)
from .signin_codes import IDLE_SESSION_KEY, LAST_ACTIVE_KEY, idle_seconds, redeem_code


class ShipmentChangeRefused(APIException):
    """A change to a shipment that has gone too far to be changed.

    409 rather than 400: the request was well formed and the caller was
    allowed to make it, so there is no field to highlight. The shipment has
    simply left, and a record of what was sent is not a form.

    Defined here, in the app that owns Package, and imported by the staff API
    as well - so a customer and a member of staff meeting the same rule get
    the same status code and the same sentence, rather than each API deciding
    for itself what a refusal looks like.
    """

    status_code = status.HTTP_409_CONFLICT
    default_detail = "This shipment can no longer be changed."


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(APIView):
    """Hands the browser a CSRF cookie before it makes its first write.

    The React app calls this once on load; every later POST/PATCH echoes the
    cookie value back in the X-CSRFToken header.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


def taken_email(errors):
    """True when signup failed because the address is already registered.

    DRF keeps the reason on each message as a `code`, so this reads that
    rather than matching on the English text of the message — which changes
    with the Django version and with the active language.
    """
    for field in ("email", "username"):
        for message in errors.get(field, []):
            if getattr(message, "code", None) == "unique":
                return True
    return False


class SignupView(generics.CreateAPIView):
    serializer_class = SignupSerializer
    permission_classes = [AllowAny]
    throttle_scope = "login"
    throttle_classes = [ScopedRateThrottle]

    def create(self, request, *args, **kwargs):
        # A site-wide ceiling on new accounts per hour, on top of the per-IP
        # throttle above - which a spoofed X-Forwarded-For can dodge.
        abuse.check("signup")

        serializer = self.get_serializer(data=request.data)

        if not serializer.is_valid():
            errors = dict(serializer.errors)

            if taken_email(errors):
                # The frontend sets username to the e-mail address, so one
                # duplicate produces two errors. The visitor never typed a
                # username; telling them one is taken is noise about a field
                # that is not on their screen.
                errors.pop("username", None)
                # A stable code, so the frontend can offer "log in instead"
                # rather than guessing from which fields happen to have
                # errors — "enter a valid e-mail address" is also an error on
                # `email`, and means something completely different.
                errors["code"] = "email_taken"

            raise ValidationError(errors)

        user = serializer.save()
        abuse.record("signup")

        # Log the new customer straight in, so they do not have to type the
        # password they just chose a second time.
        login(request, user)

        return Response(
            UserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "login"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        # Per account as well as per address: see accounts/lockout.py. The
        # throttle above is only as good as the address it is told.
        failures = lockout.account_key(str(request.data.get("username") or ""))
        if lockout.is_locked(failures, request):
            return Response(
                {"detail": "Too many failed sign-ins for this account. Try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        serializer = LoginSerializer(data=request.data, context={"request": request})

        if not serializer.is_valid():
            lockout.record_failure(failures, request)
            # 401, not 400: the frontend distinguishes bad credentials from a
            # malformed request, and shows a deliberately vague message.
            return Response(
                {"detail": "Unable to log in with the credentials provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = serializer.validated_data["user"]
        # login() cycles the session key, which closes session-fixation: a
        # session id planted before login stops being valid at this point.
        login(request, user)

        # "code_required" or "setup_required" when the admin's two-factor
        # policy says so (accounts/twofactor.py); the browser asks for the
        # authenticator code next. "off" leaves the sign-in exactly as before.
        return Response(UserSerializer(user).data | {"two_factor": twofactor.state(request)})


class WarehouseCodeLoginView(APIView):
    """Sign a warehouse worker in with the four-digit code an admin sent them.

    The same answer, 401 with the same sentence, for every failure: a malformed
    code, an address that belongs to nobody, an account that is not a warehouse
    worker, no live code, a wrong one, an expired one, a spent one, one that
    has used up its guesses. Telling them apart would let somebody learn which
    addresses are workers and which have a code outstanding.

    What stops a four-digit code being guessed is not this view but
    signin_codes.redeem_code, which allows five attempts per code in total.
    The throttle here is only a ceiling on the noise.
    """

    permission_classes = [AllowAny]
    throttle_scope = "code_login"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        body = CodeLoginSerializer(data=request.data)

        user = None
        if body.is_valid():
            user = redeem_code(
                body.validated_data["email"], body.validated_data["code"]
            )

        if user is None:
            return Response(
                {"detail": "Unable to log in with the credentials provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        start_floor_session(request, user)

        # Somebody who has just read this worker's mail may set their PIN -
        # the first time, or to replace a forgotten or locked one. Spent by
        # PinView; a PIN sign-in never sets it.
        request.session[floor.MAY_SET_PIN_KEY] = True

        # In the audit trail too when it happened on a floor device, so the
        # list of who was signed in where has no gaps.
        device = floor.device_for(request)
        if device is not None:
            FloorEvent.objects.create(
                kind=FloorEvent.Kind.CODE_SIGN_IN, user=user, device=device
            )

        return Response(UserSerializer(user).data)


def start_floor_session(request, user):
    """Sign a warehouse worker in on a shared floor device, by code or PIN."""
    # login() cycles the session key, as in LoginView.
    login(request, user)

    # A short idle timeout, not the two-week default: this account is on a
    # shared floor device, and the next person to pick it up should not be
    # signed in as the last one. WarehouseIdleMiddleware ends it once nobody
    # has done anything for that long; the expiry below is the backstop for a
    # device that goes dark altogether. An integer means "seconds of
    # inactivity", and with SESSION_SAVE_EVERY_REQUEST it slides, so working is
    # never interrupted. idle_seconds() keeps it to at least a minute.
    open_warehouse(request)


def open_warehouse(request):
    """Let this session into the warehouse, on the floor's terms.

    A short idle timeout, not the two-week default: a warehouse session is
    likely to be on a shared floor device, and the next person to pick it up
    should not be signed in as the last one. WarehouseIdleMiddleware ends it
    once nobody has done anything for that long; the expiry below is the
    backstop for a device that goes dark altogether. An integer means "seconds
    of inactivity", and with SESSION_SAVE_EVERY_REQUEST it slides, so working
    is never interrupted. idle_seconds() keeps it to at least a minute.
    """
    seconds = idle_seconds()
    request.session.set_expiry(seconds)
    request.session[IDLE_SESSION_KEY] = seconds
    request.session[LAST_ACTIVE_KEY] = time.time()
    request.session[floor.WAREHOUSE_UNLOCKED_KEY] = True


def finish_pin_sign_in(request, user, device, kind):
    """Everything after a right PIN, the same for every way of typing one.

    Starts the floor session, records the sign-in (FloorEvent), and - when the
    PIN is one a manager generated - lets this session choose a new PIN. That
    session then stays out of the warehouse until it has
    (IsWarehouseOrStaff), so the generated PIN, which somebody else has seen,
    is used exactly once.
    """
    start_floor_session(request, user)
    if floor.must_change_pin(user):
        request.session[floor.MAY_SET_PIN_KEY] = True
    FloorEvent.objects.create(kind=kind, user=user, device=device)
    if device is not None:
        floor.touch(device)


class FloorDeviceThrottle(SimpleRateThrottle):
    """Counted per registered device rather than per IP address.

    A whole warehouse is one building behind one public address, and every
    handover on every device asks for the list and sends a PIN; per address,
    the floor would throttle itself by mid-morning. A request without a valid
    device is refused anyway, and is counted by address.
    """

    def get_cache_key(self, request, view):
        device = floor.device_for(request)
        ident = f"device-{device.pk}" if device else self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class FloorRosterThrottle(FloorDeviceThrottle):
    scope = "floor_roster"


class PinLoginThrottle(FloorDeviceThrottle):
    scope = "pin_login"


NOT_A_FLOOR_DEVICE = "This is not a registered floor device."


class FloorRosterView(APIView):
    """GET: the "Who is working?" list, on a registered floor device only.

    First name and last initial, whether each has a PIN and whether it is
    locked - what the login screen needs to say "tap your name" or "ask for a
    code". From anywhere else, a 403: the list of who works here is not for
    whoever finds the login page.
    """

    permission_classes = [AllowAny]
    throttle_classes = [FloorRosterThrottle]

    def get(self, request):
        device = floor.device_for(request)
        if device is None:
            return Response({"detail": NOT_A_FLOOR_DEVICE}, status=status.HTTP_403_FORBIDDEN)

        floor.touch(device)
        response = Response({"device": {"name": device.name}, "workers": floor.roster()})
        floor.remember_device(response, request)
        return response


class PinLoginView(APIView):
    """POST {"worker": id, "pin": "1234"}: sign in on a registered floor device.

    One 401 with one sentence for every way it can fail, like the code login.
    A 429 when the device has had too many wrong PINs lately - see
    floor.sign_in_with_pin for what bounds guessing.
    """

    permission_classes = [AllowAny]
    throttle_classes = [PinLoginThrottle]

    def post(self, request):
        device = floor.device_for(request)
        if device is None:
            return Response({"detail": NOT_A_FLOOR_DEVICE}, status=status.HTTP_403_FORBIDDEN)

        try:
            user = floor.sign_in_with_pin(
                device, request.data.get("worker"), str(request.data.get("pin") or "")
            )
        except floor.DeviceCoolingOff:
            return Response(
                {"detail": "Too many wrong PINs on this device. Wait a few minutes."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        if user is None:
            return Response(
                {"detail": "Unable to log in with the credentials provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        finish_pin_sign_in(request, user, device, FloorEvent.Kind.PIN_SIGN_IN)

        response = Response(UserSerializer(user).data)
        floor.remember_device(response, request)
        return response


class WarehouseLoginView(APIView):
    """POST {"email": ..., "pin": "1234"}: /warehouse/login on any computer.

    The registered floor devices keep "tap your name" (PinLoginView); this is
    the same sign-in for a computer that is not one of them, with the e-mail
    address typed instead of a name tapped. One 401 with one sentence for
    every way it fails, so it never says which addresses work here.

    What bounds guessing: each PIN locks after five wrong tries (and ten in
    30 days), every wrong try is on the record (FloorEvent), and this
    address may only try so often (settings 'warehouse_login').
    """

    permission_classes = [AllowAny]
    throttle_scope = "warehouse_login"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        device = floor.device_for(request)
        try:
            user = floor.sign_in_with_email(
                str(request.data.get("email") or ""),
                str(request.data.get("pin") or ""),
                device,
            )
        except floor.DeviceCoolingOff:
            return Response(
                {"detail": "Too many wrong PINs on this device. Wait a few minutes."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        if user is None:
            return Response(
                {"detail": "That e-mail address or PIN is not right."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        finish_pin_sign_in(request, user, device, FloorEvent.Kind.EMAIL_PIN_SIGN_IN)
        response = Response(UserSerializer(user).data)
        if device is not None:
            floor.remember_device(response, request)
        return response


class WarehouseUnlockView(APIView):
    """POST {"email": ..., "pin": "1234"}: a warehouse worker signed in with a
    password opens the warehouse from their profile page.

    A password is how a customer signs in, and on its own it opens the
    customer profile and nothing more for a warehouse account. The worker's
    own e-mail and their PIN open the warehouse - with the short idle timeout
    of any floor session, and on the record (FloorEvent). One 401 for every
    way it can fail, counted against the PIN's five tries.
    """

    permission_classes = [IsAuthenticated]
    throttle_scope = "warehouse_unlock"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        user = request.user
        if not user.is_warehouse_worker_only:
            raise PermissionDenied("This is for warehouse workers.")

        device = floor.device_for(request)
        try:
            ok = floor.unlock_with_pin(
                user,
                str(request.data.get("email") or ""),
                str(request.data.get("pin") or ""),
                device,
            )
        except floor.DeviceCoolingOff:
            return Response(
                {"detail": "Too many wrong PINs on this device. Wait a few minutes."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        if not ok:
            return Response(
                {"detail": "That e-mail address or PIN is not right."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # A new session key for a session that has just been given more: the
        # same reason login() cycles it.
        request.session.cycle_key()
        open_warehouse(request)
        # A generated PIN opens the way to choosing their own, as at sign-in.
        if floor.must_change_pin(user):
            request.session[floor.MAY_SET_PIN_KEY] = True
        FloorEvent.objects.create(kind=FloorEvent.Kind.PIN_UNLOCK, user=user, device=device)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WarehousePinSetupView(APIView):
    """POST {"code": "4821", "pin": "5937"}: a warehouse worker signed in with
    a password sets (or replaces) their PIN with a sign-in code, from their
    profile page, and the warehouse opens.

    The same proof as everywhere else a PIN is set: a fresh code an admin
    issued to this worker. It is redeemed against the signed-in account's own
    address, so somebody else's code does nothing. The PIN is checked first,
    so one that is too easy to guess is refused without spending the code.
    This is how a worker with no PIN yet, or a locked one, gets in without
    signing out and back in with the code form.
    """

    permission_classes = [IsAuthenticated]
    throttle_scope = "warehouse_unlock"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        user = request.user
        if not user.is_warehouse_worker_only:
            raise PermissionDenied("This is for warehouse workers.")

        pin = str(request.data.get("pin") or "").strip()
        reason = floor.weak_pin_reason(pin)
        if reason:
            raise ValidationError({"pin": [reason]})

        if redeem_code(user.email, str(request.data.get("code") or "")) != user:
            return Response(
                {"detail": "That code does not work. Check it, or ask an admin for a new one."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            floor.set_pin(user, pin)
        except floor.PinRefused as refusal:
            raise ValidationError({"pin": [str(refusal)]}) from refusal

        # The code was just spent here, so it cannot also set a PIN later.
        request.session.pop(floor.MAY_SET_PIN_KEY, None)
        request.session.cycle_key()
        open_warehouse(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PinView(APIView):
    """POST {"pin": "1234"}: set your own floor PIN.

    Only in a session that began with an e-mailed code, and once per code:
    the code is the proof of who this is. Not from a PIN session, or anybody
    who watched a colleague type their PIN could change it to one of their own
    and keep the account.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.session.get(floor.MAY_SET_PIN_KEY):
            raise PermissionDenied(
                "To set your PIN, sign in with a code an admin e-mailed you."
            )

        try:
            floor.set_pin(request.user, str(request.data.get("pin") or ""))
        except floor.PinRefused as refusal:
            raise ValidationError({"pin": [str(refusal)]}) from refusal

        request.session.pop(floor.MAY_SET_PIN_KEY, None)
        return Response(status=status.HTTP_204_NO_CONTENT)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        # On the warehouse's record, next to the sign-ins: who was signed in
        # on which device, and until when. Floor accounts only - a customer
        # signing out is nobody's audit question.
        if user.is_warehouse:
            FloorEvent.objects.create(
                kind=FloorEvent.Kind.SIGN_OUT, user=user, device=floor.device_for(request)
            )
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfileView(generics.RetrieveUpdateAPIView):
    """GET and PATCH the signed-in customer's own profile."""

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        # From the session, never from a URL parameter or the request body.
        # This is what makes it impossible to read someone else's profile.
        return self.request.user

    def finalize_response(self, request, response, *args, **kwargs):
        # About this session rather than the account, so added here:
        #
        #   session_idle_seconds  how long a floor session may sit idle; null
        #                         for everyone else. The browser counts it down
        #                         and goes back to the login form.
        #   can_set_pin           signed in with an e-mailed code and not yet
        #                         used it to set a PIN.
        #   has_pin               whether this worker has a floor PIN.
        #   pin_locked            whether too many wrong tries have locked it.
        #   warehouse_unlocked    whether this session may open the warehouse
        #                         (see IsWarehouseOrStaff).
        #
        # On the PATCH too, because the profile page publishes that answer as
        # the signed-in user, and leaving them out there would switch the
        # timer off.
        if response.status_code < 400 and isinstance(response.data, dict):
            response.data["session_idle_seconds"] = request.session.get(IDLE_SESSION_KEY)
            # Two-factor, for this session: "off", "verified", "code_required"
            # or "setup_required" - and the facts the profile's two-factor
            # card needs (accounts/twofactor.py).
            response.data["two_factor"] = twofactor.state(request)
            response.data["two_factor_mode"] = twofactor.effective_mode()
            response.data["two_factor_enabled"] = twofactor.confirmed_device(request.user) is not None
            response.data["two_factor_required"] = twofactor.is_required_for(request.user)
            response.data["can_set_pin"] = bool(request.session.get(floor.MAY_SET_PIN_KEY))
            pin = (
                WarehousePin.objects.filter(user=request.user).first()
                if request.user.is_warehouse_worker_only
                else None
            )
            response.data["has_pin"] = pin is not None
            response.data["pin_locked"] = bool(pin and pin.locked_at)
            # Still on a PIN a manager generated: the app sends them to choose
            # their own, and the warehouse API refuses them until they have.
            response.data["pin_must_change"] = bool(pin and pin.must_change)
            # A warehouse manager needs no unlock (IsWarehouseOrStaff), so the
            # app should not ask them for one.
            response.data["warehouse_unlocked"] = bool(
                request.session.get(floor.WAREHOUSE_UNLOCKED_KEY)
                or request.user.is_warehouse_manager
            )
        return super().finalize_response(request, response, *args, **kwargs)


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save()

        # Changing the password invalidates the session hash, which would log
        # the customer out of the tab they are sitting in. This keeps them in.
        update_session_auth_hash(request, user)

        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(APIView):
    """Step one: "I have forgotten my password".

    Always answers 204, whether or not the address belongs to an account.
    Answering differently would turn this into a way to ask the site which
    e-mail addresses are registered — the same reason the login endpoint gives
    one message for a wrong password and an unknown user.

    That is also why nothing here reports a mail failure: the response must not
    depend on anything that only happens when the account exists.
    """

    permission_classes = [AllowAny]
    throttle_scope = "password_reset"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Past the per-address ceiling the answer is still 204: refusing out
        # loud would say the address had been asked for recently.
        if not lockout.reset_mail_allowed(serializer.validated_data["email"]):
            return Response(status=status.HTTP_204_NO_CONTENT)

        user = serializer.account()
        if user is not None:
            send_password_reset(user, serializer.validated_data.get("language", ""))

        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(APIView):
    """Step two: the new password, with the link's uid and token."""

    permission_classes = [AllowAny]
    throttle_scope = "password_reset"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["new_password"])
        user.save()

        # Deliberately not logged in afterwards. Someone holding the link has
        # proved they can read the mailbox, which is what earns them the right
        # to set a password — not the right to be signed in without using it.
        #
        # Saving the new hash also invalidates every existing session for this
        # account, which is the point when the reason for the reset was that
        # somebody else had got in.
        return Response(status=status.HTTP_204_NO_CONTENT)


class AccountDeleteView(APIView):
    """Erase the signed-in customer's account.

    Two different outcomes, on purpose:

    * No shipments — the row is deleted outright. Nothing needs keeping.
    * Has shipments — personal data is stripped and the row stays. A shipping
      company has to keep its commercial records (Dutch tax law: seven years),
      and a package row with a dangling user reference is a broken record.
      Anonymising satisfies the right to erasure without destroying the
      accounting trail.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AccountDeleteSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        user = request.user
        had_packages = user.packages.exists()

        # End the session before touching the row, so no half-valid session
        # survives the change.
        logout(request)

        anonymised = had_packages
        if had_packages:
            user.anonymise()
        else:
            try:
                with transaction.atomic():
                    user.delete()
            except ProtectedError:
                # A staff account that has signed audit records (warehouse
                # activity, measurements, invoice reviews) cannot vanish from
                # them; it is anonymised instead, like a customer with orders.
                user.anonymise()
                anonymised = True

        return Response(
            {"anonymised": anonymised},
            status=status.HTTP_200_OK,
        )


class AddressViewSet(viewsets.ModelViewSet):
    """A customer's own addresses. Several per customer, all CRUD."""

    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Scoped to the caller. Without this, /api/addresses/5/ would return
        # whichever customer's address happened to have id 5.
        return Address.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class PackageViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Customers follow their shipments; staff move them along.

    Read-only, with one exception: the customer chooses how they get the
    shipment at the end - delivered, or collected by them (the `handover`
    action below). Everything else - status, destination, contents - is the
    office's, at the counter, from the dashboard.
    Each shipment carries `locked`, `locked_for_customer` and `lock_reason`
    (see PackageSerializer) so the profile page can render a shipment that has
    already gone as a record rather than as a form.
    """

    serializer_class = PackageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # The address comes along: every row reads its country for
        # `destination`, and one query beats one per shipment.
        return (
            Package.objects.filter(user=self.request.user)
            .select_related("delivery_address")
            .prefetch_related("photos", "warehouse_measurements")
        )

    @action(
        detail=True,
        methods=["get"],
        url_path=r"photos/(?P<photo_id>[0-9]+)",
        url_name="photo",
    )
    def photo(self, request, pk=None, photo_id=None):
        """One photo the warehouse took of this package.

        get_object() goes through the queryset above, so it is always one of
        the caller's own packages - anyone else's is a 404.
        """
        from warehouse.models import PackagePhoto
        from warehouse.records import stream_photo

        package = self.get_object()
        photo = get_object_or_404(PackagePhoto, pk=photo_id, package=package)
        return stream_photo(photo)

    @action(detail=True, methods=["post"])
    def handover(self, request, pk=None):
        """POST {"handover": "delivery" | "pickup"}: the customer's choice.

        "pickup" means the customer comes to collect it; the last step of
        their timeline then says "Picked up" instead of "Delivered" (see
        accounts/public.py). The office sees the choice under Packages and
        can change it too.

        get_object() only finds the caller's own shipments, so nobody can
        choose for somebody else's. Refused once the shipment is delivered
        or cancelled: there is nothing left to choose.

        The customer chooses only once. After that a second choice is
        refused and they have to e-mail the office, which can still change it
        from the staff side.
        """
        package = self.get_object()

        choice = request.data.get("handover")
        if choice not in Package.Handover.values:
            raise ValidationError({"handover": ["Choose delivery or pickup."]})
        if package.status in Package.TERMINAL_STATUSES:
            raise ValidationError(
                {"handover": ["This shipment is finished; this can no longer be changed."]}
            )
        if package.handover_chosen_at is not None:
            raise ValidationError(
                {"handover": ["You have already chosen. E-mail us to change it."]}
            )

        previous = package.handover
        package.handover = choice
        # Even choosing what it already was counts: the choice is now locked.
        package.handover_chosen_at = timezone.now()
        package.save(update_fields=["handover", "handover_chosen_at", "updated_at"])
        # A real change is mailed: to the office, which plans the delivery or
        # the pickup, and to the customer as a confirmation. After the commit,
        # so nothing is sent for a change that did not stick.
        if choice != previous:
            transaction.on_commit(lambda: send_handover_changed(package, previous))
        return Response(self.get_serializer(package).data)


class PackageDocumentViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """The paperwork a customer attaches to their own shipment.

    The receipt for the television they bought, the shop's invoice, a customs
    form. It goes the opposite way to an invoice: the business sends those out,
    and these come in.

    Staff read the same rows through the same view. The queryset below is what
    decides who sees what, in one place rather than in each handler, so no id
    arriving from a browser has escaped being narrowed to rows that caller may
    see - somebody else's receipt is a 404 and not a decision made later.
    """

    serializer_class = PackageDocumentSerializer
    permission_classes = [IsAuthenticated]
    # DRF's defaults already accept JSON, form and multipart, which is what
    # this viewset needs: uploads arrive as multipart and `attach` below is
    # ordinary JSON. Pinning it to multipart, as this once did, answered 415
    # to every JSON body — including that action's.

    def get_queryset(self):
        queryset = PackageDocument.objects.select_related(
            "customer", "package", "uploaded_by"
        )

        # Staff are the audience for these: a receipt nobody in the office can
        # open is a receipt that was not worth uploading.
        #
        # Scoped by `customer`, not by `package__user`: a document need not
        # have a shipment, and scoping through one would make every unattached
        # receipt invisible to the person who uploaded it.
        if not self.request.user.is_staff:
            queryset = queryset.filter(customer=self.request.user)

        params = self.request.query_params

        # ?package=<id> is how both the profile page and the dashboard ask for
        # the files belonging to one shipment.
        package = params.get("package")
        if package:
            queryset = queryset.filter(package_id=package)

        # The dashboard's own three, none of which a customer has any use for
        # but none of which leak anything either: the queryset above has
        # already narrowed to rows the caller may see, so these only ever
        # shrink that set further.
        if params.get("unattached") == "true":
            # The queue that matters: a document nobody has filed against a
            # shipment yet.
            queryset = queryset.filter(package__isnull=True)

        kind = params.get("kind")
        if kind in dict(PackageDocument.Kind.choices):
            queryset = queryset.filter(kind=kind)

        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(note__icontains=search)
                | Q(original_name__icontains=search)
                | Q(customer__first_name__icontains=search)
                | Q(customer__last_name__icontains=search)
                | Q(customer__email__icontains=search)
                | Q(package__tracking_number__icontains=search)
            )

        return queryset

    def create(self, request, *args, **kwargs):
        """Attach a file to one of the caller's own shipments.

        The package comes from the body, so it is checked against the caller
        rather than trusted: without that, any signed-in customer could file a
        receipt under a stranger's parcel and have the office read it there.
        """
        body = PackageDocumentUploadSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        package = self._package_for(request)
        upload = body.validated_data["file"]

        # The rule at the heart of this: paperwork for something bought now
        # cannot be filed against a shipment that has already left. The
        # receipt is still kept - it arrives unfiled, exactly as a receipt for
        # a parcel that does not exist yet does, and the office files it
        # against the new shipment when that shipment is created. Losing the
        # upload would teach customers to keep quiet about the second purchase.
        filed_separately = False
        if package is not None and not package.can_change(by_staff=request.user.is_staff):
            lock_reason = package.lock_reason
            package = None
            filed_separately = True

        # Whose it is. The shipment's owner when there is a shipment — so a
        # staff member attaching a receipt on a customer's behalf files it
        # under that customer and not under themselves — and otherwise the
        # person uploading.
        customer = package.user if package else request.user

        document = PackageDocument.objects.create(
            customer=customer,
            package=package,
            uploaded_by=request.user,
            kind=body.validated_data["kind"],
            note=body.validated_data.get("note", ""),
            file=upload,
            # Kept so the customer's own list shows the name they recognise.
            # Truncated rather than refused: a name too long for the column is
            # not a reason to reject a valid receipt.
            original_name=(upload.name or "")[:255],
            # The type for the checked extension, not the browser's claim.
            content_type=PackageDocument.CONTENT_TYPES[
                os.path.splitext(upload.name or "")[1].lower()
            ],
            size_bytes=upload.size,
        )

        # Read it with AI and match it to the right shipment (docreview/).
        # Does nothing unless automatic document reading is switched on.
        from docreview.pipeline import job_for_package_document

        job_for_package_document(document)

        data = self.get_serializer(document).data

        if filed_separately:
            # Said in the body rather than by a different status code: the
            # upload did succeed, and 201 is the truth about it. What changed
            # is where it landed, and the caller is told so plainly enough to
            # put on the screen.
            data["filed_separately"] = True
            data["detail"] = (
                f"{lock_reason} Your file has been received and will be filed "
                "against the new shipment."
            )

        return Response(data, status=status.HTTP_201_CREATED)

    def _package_for(self, request):
        """The shipment this upload is for, if any, or a refusal.

        None is a real answer. A receipt exists before the parcel does —
        somebody buys a television and books the shipment days later — so a
        document with no shipment is a normal document, not an incomplete one.

        When a shipment *is* named it is checked against the caller rather
        than trusted: without that, any signed-in customer could file a
        receipt under a stranger's parcel and have the office read it there.
        Staff may attach to any package, which is what they do for a customer
        who has e-mailed one in.
        """
        package_id = request.data.get("package")
        if not package_id:
            return None

        packages = Package.objects.all()
        if not request.user.is_staff:
            packages = packages.filter(user=request.user)

        try:
            return packages.get(pk=package_id)
        except (Package.DoesNotExist, ValueError, TypeError):
            # The same answer whether the parcel does not exist or belongs to
            # somebody else. Telling those two apart would turn this into a
            # way to discover which tracking numbers are real.
            raise ValidationError({"package": "No such shipment."}) from None

    def perform_destroy(self, instance):
        """Remove an upload, and the file with it.

        Deleting the row alone would leave the bytes on disk for ever, which
        for a document holding somebody's address and card digits is the one
        outcome a delete button must not have.

        A customer may withdraw what they sent in - the wrong photograph, the
        wrong parcel - right up until the shipment leaves. After that the
        paperwork is part of what was sent, and taking a receipt off a
        shipment already at sea is editing a record, not correcting a form.

        Staff may still remove anything. Somebody has to be able to clear up a
        receipt filed against the wrong shipment, and a misfiling discovered
        after the boat sailed is exactly when that matters most.
        """
        if not self.request.user.is_staff and instance.package_id:
            instance.package.check_can_change(by_staff=False)

        stored = instance.file.name
        instance.delete()
        if stored:
            instance.file.storage.delete(stored)

    @action(detail=True, methods=["post"])
    def attach(self, request, pk=None):
        """File a document against a shipment, or unfile it. Staff only.

        The other half of letting a receipt arrive before the parcel does.
        Somebody uploads the till receipt for a television on the day they buy
        it; the shipment is booked later, and this is what joins the two so
        the document turns up on the parcel where the office will look for it.

        Customers are refused. They choose a shipment when they upload, from
        a list that is already only their own — but a customer moving a
        document afterwards is a customer moving evidence between shipments,
        and the office is the party that has to be able to trust where a
        receipt is filed.
        """
        if not request.user.is_staff:
            raise PermissionDenied("Only staff can file a document.")

        document = self.get_object()
        package_id = request.data.get("package")

        # Unfiling is not blocked on a locked shipment, and filing onto one
        # is. The asymmetry is deliberate: taking a document off a shipment it
        # was never part of corrects a mistake in the filing, while putting a
        # new one on says something travelled that did not.
        if package_id in (None, "", "null"):
            # Unfiling is a real action: a receipt on the wrong parcel has to
            # be able to come off it, and setting it to nothing is how.
            document.package = None
        else:
            try:
                # Any customer's, because staff see every document here. The
                # owner does not change: whose paperwork this is was decided
                # at upload, and moving it between parcels must not quietly
                # reassign it to somebody else.
                target = Package.objects.get(pk=package_id)
            except (Package.DoesNotExist, ValueError, TypeError):
                raise ValidationError({"package": "No such shipment."}) from None

            # Only onto one of the document's own customer's shipments. On
            # somebody else's, the owner would see that other customer's
            # tracking number on their receipt - and the receipt would describe
            # a shipment it never belonged to.
            if document.customer_id and target.user_id != document.customer_id:
                raise ValidationError(
                    {"package": "That shipment belongs to another customer."}
                )

            if target.locked:
                raise ShipmentChangeRefused(
                    f"{target.lock_reason} File this against the shipment "
                    "that carries it instead."
                )

            document.package = target

        document.save(update_fields=["package"])

        return Response(self.get_serializer(document).data)

    @action(detail=True, methods=["get"])
    def file(self, request, pk=None):
        """Stream the document itself.

        get_object() applies the queryset above, so this is already limited to
        a file the caller may see. The remaining failure is a row pointing at
        bytes that are not there - a media directory restored without its
        contents - which is a 404 rather than the 500 that opening a missing
        file would otherwise produce.
        """
        document = self.get_object()

        try:
            handle = document.file.open("rb")
        except FileNotFoundError as error:
            raise Http404("This document is missing.") from error

        # as_attachment, so a browser saves it under a name that means
        # something rather than rendering it in a tab named by its storage
        # path. See PackageDocument.filename for why that name is scrubbed.
        return FileResponse(
            handle,
            as_attachment=True,
            filename=document.filename,
            # From the stored file's extension, so rows saved before this
            # check existed are served correctly too.
            content_type=document.served_content_type,
        )


class ReauthenticateView(APIView):
    """POST {"password": "...", "code": "123456"?}: "yes, it is really me".

    Opens the short window in which sensitive admin actions are allowed
    (accounts/reauth.py). The code is only asked for when this person uses
    two-factor sign-in. Wrong passwords count towards the same per-account
    lockout as the login form, so this cannot be used to guess passwords.
    """

    permission_classes = [IsAuthenticated]
    throttle_scope = "login"
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        user = request.user
        failures = lockout.account_key(user.get_username())
        if lockout.is_locked(failures, request):
            return Response(
                {"detail": "Too many failed attempts for this account. Try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        if not user.check_password(str(request.data.get("password") or "")):
            lockout.record_failure(failures, request)
            return Response({"password": ["That password is not right."]}, status=status.HTTP_400_BAD_REQUEST)

        # The second factor too, for somebody who has one: otherwise a
        # password seen over a shoulder would be enough after all.
        if twofactor.available() and twofactor.confirmed_device(user) is not None:
            result = twofactor.verify(user, str(request.data.get("code") or ""), request)
            if result == "locked":
                return Response(
                    {"detail": "Too many wrong codes. Wait 15 minutes and try again."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            if result != "ok":
                return Response({"code": ["That code is not right."]}, status=status.HTTP_400_BAD_REQUEST)

        reauth.mark(request)
        return Response({"ok": True, "valid_for_seconds": reauth.window_seconds()})
