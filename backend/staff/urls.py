"""Staff dashboard routes, mounted under /api/staff/ by config/urls.py."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from blog.views import StaffBlogPostViewSet
from docreview.views import DocumentJobViewSet
from ops import views as ops_views
from shops.views import ShopViewSet
from warehouse import access as warehouse_access
from warehouse import manager as warehouse_manager
from warehouse import records as warehouse_records
from warehouse import review as warehouse_review
from warehouse import shipments as warehouse_shipments
from warehouse import views as warehouse_views

from . import floor, invoice_config, reports, security, site_settings, views

router = DefaultRouter()
router.register("quotes", views.QuoteRequestViewSet, basename="staff-quote")
router.register("messages", views.ContactMessageViewSet, basename="staff-message")
# AI document reading with human review (docreview/views.py).
router.register("document-jobs", DocumentJobViewSet, basename="staff-document-job")
router.register("packages", views.PackageViewSet, basename="staff-package")
router.register("bookings", views.BookingViewSet, basename="staff-booking")
# The products on the bookings, with the office's price check.
router.register(
    "booking-products", views.BookingProductViewSet, basename="staff-booking-product"
)
router.register("invoices", views.InvoiceViewSet, basename="staff-invoice")
# The invoice settings page's lists. Read by all staff, changed by admins.
router.register("invoice-ports", invoice_config.PortViewSet, basename="staff-invoice-port")
router.register(
    "invoice-charge-types", invoice_config.ChargeTypeViewSet, basename="staff-invoice-charge-type"
)
router.register("customers", views.CustomerViewSet, basename="staff-customer")
# Shared floor devices that may sign a warehouse worker in with a PIN. Admins.
router.register("floor-devices", floor.FloorDeviceViewSet, basename="staff-floor-device")
# Areas of the warehouse a floor device can be allowed into. Admins.
router.register("floor-locations", floor.FloorLocationViewSet, basename="staff-floor-location")
# The webshops the services page lists. The viewset lives in the shops app;
# this is the door it is reached through, so "everything under /api/staff/ is
# behind IsStaff" stays a single true sentence.
router.register("shops", ShopViewSet, basename="staff-shop")
# The blog's posts, drafts included. The viewset lives in the blog app; like
# the shops, this is the door it is reached through.
router.register("blog", StaffBlogPostViewSet, basename="staff-blog")
# The warehouse's own intake sheets. Registered here rather than on a route of
# their own so that "everything under /api/staff/ is behind IsStaff" stays a
# single true sentence - the viewset lives in the warehouse app, but this is
# the door it is reached through.
router.register("intake", warehouse_views.IntakeSheetViewSet, basename="staff-intake")
# The warehouse's view of shipments: scan, move through the floor's stages,
# flag problems. IsWarehouseOrStaff, like the intake sheets.
router.register(
    "warehouse/shipments",
    warehouse_shipments.ShipmentViewSet,
    basename="staff-warehouse-shipment",
)
# The warehouse's own records, read by the floor and the office alike.
router.register(
    "warehouse/activity", warehouse_records.ActivityViewSet, basename="staff-warehouse-activity"
)
router.register(
    "warehouse/measurements",
    warehouse_records.MeasurementViewSet,
    basename="staff-warehouse-measurement",
)
router.register(
    "warehouse/packaging", warehouse_records.PackagingViewSet, basename="staff-warehouse-packaging"
)
router.register(
    "warehouse/damage", warehouse_records.DamageReportViewSet, basename="staff-warehouse-damage"
)

urlpatterns = [
    path("overview/", views.OverviewView.as_view(), name="staff-overview"),
    # The daily summary on the Overview page (staff/daily_summary.py).
    path("summary/", views.DailySummaryView.as_view(), name="staff-daily-summary"),
    # The monthly report: one month's figures, the month before, and a year
    # of history for the chart. See staff/reports.py.
    path("reports/monthly/", reports.MonthlyReportView.as_view(), name="staff-monthly-report"),
    # The System page: backups, error monitoring, e-mail. Admins only.
    path("system/", ops_views.SystemStatusView.as_view(), name="staff-system"),
    path(
        "invoice-settings/",
        invoice_config.InvoiceSettingsView.as_view(),
        name="staff-invoice-settings",
    ),
    # Admin-only: what address headers a request arrives with, for setting
    # DJANGO_NUM_PROXIES. See RequestOriginView.
    path("request-origin/", views.RequestOriginView.as_view(), name="staff-request-origin"),
    # E-mail a warehouse worker a four-digit sign-in code. Admins only.
    path(
        "workers/sign-in-code/",
        views.WarehouseSignInCodeView.as_view(),
        name="staff-warehouse-sign-in-code",
    ),
    # Take a worker's floor PIN away, and the record of floor sign-ins. Admins.
    path(
        "workers/<int:pk>/reset-pin/",
        floor.WorkerPinResetView.as_view(),
        name="staff-worker-reset-pin",
    ),
    # Generate a new PIN for a warehouse worker, shown once.
    path(
        "workers/<int:pk>/issue-pin/",
        floor.WorkerPinIssueView.as_view(),
        name="staff-worker-issue-pin",
    ),
    path("floor-events/", floor.FloorEventListView.as_view(), name="staff-floor-events"),
    # What warehouse workers may see: read by the warehouse app, set by admins.
    path(
        "warehouse/access/",
        warehouse_access.WarehouseAccessView.as_view(),
        name="staff-warehouse-access",
    ),
    # The warehouse manager's dashboard (/warehouse/manager): the overview
    # numbers and the activity log. Admins and warehouse managers.
    # Which existing customer goods belong to (warehouse/customers.py).
    path(
        "warehouse/customers/",
        warehouse_views.CustomerLookupView.as_view(),
        name="staff-warehouse-customer-lookup",
    ),
    path(
        "warehouse/manager/stats/",
        warehouse_manager.ManagerStatsView.as_view(),
        name="staff-warehouse-manager-stats",
    ),
    # Released sheets for the manager to approve or send back.
    path(
        "warehouse/manager/review/",
        warehouse_review.ReviewQueueView.as_view(),
        name="staff-warehouse-manager-review",
    ),
    path(
        "warehouse/manager/activity/",
        warehouse_manager.ManagerActivityView.as_view(),
        name="staff-warehouse-manager-activity",
    ),
    path(
        "warehouse/report/",
        warehouse_records.WarehouseReportView.as_view(),
        name="staff-warehouse-report",
    ),
    # The Security page: the two-factor policy. Admins only.
    path(
        "security/two-factor/",
        security.TwoFactorPolicyView.as_view(),
        name="staff-two-factor-policy",
    ),
    # Which pages of the public site are on (admins): the Website page.
    path("site-settings/", site_settings.SiteSettingsView.as_view(), name="staff-site-settings"),
    # The Integrations page: API keys and webhooks. Admins only.
    path("integrations/", include("integrations.staff_urls")),
    path("", include(router.urls)),
]
