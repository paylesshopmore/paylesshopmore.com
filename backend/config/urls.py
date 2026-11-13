"""URL configuration for the project.

Every address the backend answers starts here. Each app's own urls.py adds
its part under /api/ (accounts, bookings, enquiries, ...), and the office's
and the warehouse's under /api/staff/. Which frontend file calls which app,
and how the pages connect, is in docs/WEBSITE-MAP.md.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from .admin_login import throttled_admin_login
from .health import health, ready

# Before admin.site.urls is read below: that is when the login route is built
# from admin.site.login.
admin.site.login = throttled_admin_login(admin.site.login)

urlpatterns = [
    path('admin/', admin.site.urls),
    # Above the app routes so a probe never depends on an app's URL module
    # importing cleanly. Public by design — see config/health.py.
    path('api/health/', health, name='health'),
    path('api/ready/', ready, name='ready'),
    path('api/', include('accounts.urls')),
    path('api/', include('enquiries.urls')),
    path('api/', include('bookings.urls')),
    path('api/', include('notifications.urls')),
    path('api/', include('invoicing.urls')),
    # The shops the services page lists. Read-only and public; the office
    # edits them through /api/staff/shops/ below.
    path('api/', include('shops.urls')),
    # The blog: published articles, read-only and public. The office writes
    # them through /api/staff/blog/ below.
    path('api/', include('blog.urls')),
    # The back-office API. Behind IsStaff, so a non-staff account gets 403
    # from every route under it.
    path('api/staff/', include('staff.urls')),
    # Other software, signed in with an API key (integrations/views.py).
    path('api/integrations/v1/', include('integrations.urls')),
    # Courier tracking: the courier list and 17TRACK's webhook (tracking/).
    path('api/tracking/', include('tracking.urls')),
    # Courier tracking in the back office.
    path('api/staff/carrier-tracking/', include('tracking.staff_urls')),
    # The carriers' own API settings (admins only).
    path('api/staff/tracking-integrations/', include('tracking.integration_urls')),
    # Pre-alerts: the customer's own, and the office's list (prealerts/).
    path('api/', include('prealerts.urls')),
    # Error reports from the visitor's browser (ops/views.py).
    path('api/', include('ops.urls')),
    path('api/staff/prealerts/', include('prealerts.staff_urls')),
    # The chat assistant on the website (assistant/views.py).
    path('api/', include('assistant.urls')),
    path('api/', include('feedback.urls')),
    # The office's login activity map (loginactivity/). Staff only.
    path('api/admin/login-activity/', include('loginactivity.urls')),
]

if settings.DEBUG:
    # Development only. static() is a convenience for the runserver and does
    # nothing when DEBUG is off; in production a web server or object store
    # serves MEDIA_ROOT, which is how these visitor-uploaded files stay out of
    # Django's request path entirely.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
