"""API routes, mounted under /api/ by config/urls.py."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import driver, public, twofactor_views, views

router = DefaultRouter()
# The driver's deliveries: what has arrived and is waiting to be handed over.
router.register("driver/deliveries", driver.DeliveryViewSet, basename="driver-delivery")
router.register("addresses", views.AddressViewSet, basename="address")
router.register("packages", views.PackageViewSet, basename="package")
# The paperwork customers send in — receipts, shop invoices, customs
# forms. Read by staff through the same routes; the queryset is what
# decides who sees which rows.
router.register(
    "documents", views.PackageDocumentViewSet, basename="package-document"
)

urlpatterns = [
    # The public site's tracking page and statistics band. The statistics are
    # open to anyone; tracking takes an account and finds only its own
    # shipments. A tracking number is an identifier, not a credential — see
    # accounts/public.py for what that means for these two.
    path(
        "track/<str:tracking_number>/",
        public.TrackingView.as_view(),
        name="track",
    ),
    path("stats/", public.SiteStatsView.as_view(), name="site-stats"),
    # Which parts of the public site an admin has switched on (SiteSettings).
    path("site/", public.SiteSwitchesView.as_view(), name="site-switches"),

    path("auth/csrf/", views.CsrfView.as_view(), name="csrf"),
    path("auth/signup/", views.SignupView.as_view(), name="signup"),
    path("auth/login/", views.LoginView.as_view(), name="login"),
    # Warehouse workers only: the four-digit code an admin e-mailed them.
    path(
        "auth/code-login/",
        views.WarehouseCodeLoginView.as_view(),
        name="code-login",
    ),
    # A shared floor device an admin registered: the "Who is working?" list,
    # and signing in from it with a PIN. Refused from any other device.
    path("auth/floor/", views.FloorRosterView.as_view(), name="floor-roster"),
    path("auth/pin-login/", views.PinLoginView.as_view(), name="pin-login"),
    # /warehouse/login on a computer that is not a registered floor device.
    path("auth/warehouse-login/", views.WarehouseLoginView.as_view(), name="warehouse-login"),
    # A warehouse worker signed in with a password: e-mail and PIN open the
    # warehouse from the profile page.
    path(
        "auth/warehouse-unlock/",
        views.WarehouseUnlockView.as_view(),
        name="warehouse-unlock",
    ),
    # The same worker with no PIN yet, or a locked one: a sign-in code from an
    # admin sets a new PIN and opens the warehouse.
    path(
        "auth/warehouse-pin-setup/",
        views.WarehousePinSetupView.as_view(),
        name="warehouse-pin-setup",
    ),
    path("auth/logout/", views.LogoutView.as_view(), name="logout"),
    # "Confirm it's you" before a sensitive admin action (accounts/reauth.py).
    path("auth/reauthenticate/", views.ReauthenticateView.as_view(), name="reauthenticate"),
    # Two-factor sign-in, the person's own side (accounts/twofactor_views.py).
    path("auth/2fa/", twofactor_views.StatusView.as_view(), name="two-factor"),
    path("auth/2fa/setup/", twofactor_views.SetupView.as_view(), name="two-factor-setup"),
    path("auth/2fa/confirm/", twofactor_views.ConfirmView.as_view(), name="two-factor-confirm"),
    path("auth/2fa/verify/", twofactor_views.VerifyView.as_view(), name="two-factor-verify"),
    path(
        "auth/2fa/recovery-codes/",
        twofactor_views.RecoveryCodesView.as_view(),
        name="two-factor-recovery-codes",
    ),
    path("auth/2fa/disable/", twofactor_views.DisableView.as_view(), name="two-factor-disable"),
    path(
        "auth/password-reset/",
        views.PasswordResetRequestView.as_view(),
        name="password-reset",
    ),
    path(
        "auth/password-reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("profile/", views.ProfileView.as_view(), name="profile"),
    path("profile/password/", views.PasswordChangeView.as_view(), name="password"),
    # A warehouse worker setting their floor PIN, straight after an e-mailed code.
    path("profile/pin/", views.PinView.as_view(), name="pin"),
    path("profile/delete/", views.AccountDeleteView.as_view(), name="account-delete"),
    path("", include(router.urls)),
]
