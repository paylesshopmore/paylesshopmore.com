"""Who is allowed into the staff API."""

from rest_framework.permissions import BasePermission
from rest_framework.throttling import UserRateThrottle

from accounts.floor import WAREHOUSE_UNLOCKED_KEY, must_change_pin


class WarehouseRateThrottle(UserRateThrottle):
    """A per-account budget sized for scanning all day. See settings 'warehouse'."""

    scope = "warehouse"


class IsStaff(BasePermission):
    """Only active staff accounts.

    `is_staff` is the same flag that opens Django's own /admin/, so there is
    one place to grant or revoke back-office access rather than two that can
    drift apart.

    Checked on the server for every request. The React app also hides the
    dashboard from non-staff, but that is only tidiness — anyone can edit the
    JavaScript running in their own browser, and this is what actually holds.
    """

    message = "This area is for staff accounts only."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.is_staff)


class IsAdmin(BasePermission):
    """Admins only: the role that may decide what other accounts can do.

    Office workers share every other back-office screen with admins. What
    they do not get is the power to hand out roles, so a compromised or
    careless office account cannot make itself - or anybody - an admin.
    """

    message = "Only an admin can do this."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_admin)


class IsWarehouseManager(BasePermission):
    """Admins, and warehouse managers: whoever runs the warehouse floor.

    The warehouse workers' accounts, their sign-in codes and PINs, the floor
    devices and locations, and the Warehouse access switches. A manager is not
    staff, so everything behind IsStaff - invoices, customers, quotes - stays
    closed to them.
    """

    message = "Only an admin or a warehouse manager can do this."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.can_manage_warehouse)


class IsStaffOrWarehouseManager(BasePermission):
    """The office, or a warehouse manager - who then sees only what the view
    narrows down for them (the Workers page: warehouse workers only)."""

    message = "This area is for staff accounts only."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False
        return bool(user.is_staff or user.is_warehouse_manager)


class IsDriverOrStaff(BasePermission):
    """Drivers, and the office - which may need to record a delivery itself.

    A warehouse account is not a driver: goods at the destination are not the
    floor's in the Netherlands.
    """

    message = "This area is for drivers and office accounts only."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False
        return bool(user.role == user.Role.DRIVER or user.is_staff)


class IsWarehouseOrStaff(BasePermission):
    """The floor as well as the office.

    Used by the intake sheets and the scanner, and by nothing else. A
    warehouse account is is_warehouse without is_staff, so IsStaff above keeps
    it out of invoices, customers, quotes and Django's own /admin/ - which is
    the whole point of the two flags being separate.

    Read this and IsStaff together as the answer to "what can a phone on the
    warehouse floor reach": these two classes are the entire list, and a route
    that names neither is closed to a warehouse account.
    """

    message = "This area is for warehouse and office accounts only."

    def has_permission(self, request, view):
        user = request.user

        if not (user and user.is_authenticated and user.is_active):
            return False

        if user.is_staff:
            return True

        # A warehouse manager signs in with a password from their own
        # computer, like the office, and runs the floor rather than working a
        # shared device - so no PIN or code step, as for the office.
        if user.is_warehouse_manager:
            return True

        # A floor account gets in only once this session has shown it is them
        # for the warehouse: an e-mailed code, a PIN on a floor device, or
        # their e-mail and PIN on the profile page after a password. A
        # password on its own opens the customer profile and nothing here.
        # See accounts/floor.py.
        if user.is_warehouse:
            if not request.session.get(WAREHOUSE_UNLOCKED_KEY):
                return False
            # Signed in with a PIN a manager generated: somebody else has
            # seen it, so nothing opens until the worker has chosen their own
            # (accounts PinView). Checked here, on the server, for every
            # request - not only by the app sending them to the PIN page.
            if must_change_pin(user):
                self.message = "Choose your own PIN first."
                return False
            return True

        return False
