"""The office's "Login activity" API, mounted at /api/admin/login-activity/.

READ THIS FIRST
===============

    GET  /api/admin/login-activity/                  the table (paginated)
    GET  /api/admin/login-activity/stats/            the cards above the map
    GET  /api/admin/login-activity/map/              the markers and the heatmap
    GET  /api/admin/login-activity/suspicious/       flagged attempts to review
    POST /api/admin/login-activity/suspicious/<id>/review/   "I have looked at this"
    GET  /api/admin/login-activity/export/           CSV download

WHO MAY USE IT
--------------
Office staff and admins only (IsStaff). Checked here, on the server, for every
request: the React page also hides the menu item, but that is only tidiness -
anybody can edit the JavaScript in their own browser. A customer, a warehouse
worker, a warehouse manager or somebody not signed in gets a 403. There is no
public route to any of this.

THE FILTERS
-----------
The table, the cards, the map and the CSV all use the SAME filters
(filter_rows below), so the numbers on the cards always match the rows in the
table and the dots on the map:

    ?period=today|7d|30d       how far back
    ?status=success|failed
    ?security=suspicious|notice|normal|blocked|flagged
    ?country=NL | unknown      a country code, or the unknown ones
    ?user=<id or part of an e-mail address>
    ?search=<text>             matches the account name, IP, country or city
    ?ordering=-created_at      one of ORDERING_FIELDS, "-" for descending

Everything here reads real rows from the database. Nothing is invented.
"""

import csv
import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.sessions.models import Session
from django.db.models import Count, F, Q
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from accounts.reauth import require_recent_reauth
from staff.permissions import IsStaff

from .models import LoginActivity
from .serializers import LoginActivitySerializer

logger = logging.getLogger(__name__)

# The columns the table may be sorted by. An allow-list: ?ordering= is never
# passed to the database as typed.
ORDERING_FIELDS = {
    "created_at",
    "identifier",
    "ip_address",
    "country",
    "city",
    "browser",
    "status",
    "security_status",
}

# Most points the map draws at once, and most rows one CSV holds. A ceiling
# keeps one request from reading the whole table into memory.
MAP_LIMIT = 2000
EXPORT_LIMIT = 50_000

PERIODS = {"7d": timedelta(days=7), "30d": timedelta(days=30)}


def base_rows():
    return LoginActivity.objects.select_related("reviewed_by")


def filter_rows(rows, params):
    """Apply the filters in the URL to a LoginActivity queryset."""
    period = params.get("period", "")
    if period == "today":
        start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
        rows = rows.filter(created_at__gte=start)
    elif period in PERIODS:
        rows = rows.filter(created_at__gte=timezone.now() - PERIODS[period])

    if params.get("status") in LoginActivity.Status.values:
        rows = rows.filter(status=params["status"])

    wanted = params.get("security", "")
    if wanted == "suspicious":
        # What the "Suspicious" card counts: crossed a threshold, or came from
        # a blocked address. A mere notice is not suspicious.
        rows = rows.filter(
            security_status__in=[LoginActivity.Security.SUSPICIOUS, LoginActivity.Security.BLOCKED]
        )
    elif wanted == "flagged":
        rows = rows.exclude(security_status=LoginActivity.Security.NORMAL)
    elif wanted in LoginActivity.Security.values:
        rows = rows.filter(security_status=wanted)

    country = params.get("country", "").strip()
    if country.lower() == "unknown":
        rows = rows.filter(country_code="")
    elif country:
        rows = rows.filter(Q(country_code__iexact=country) | Q(country__iexact=country))

    user = params.get("user", "").strip()
    if user.isdigit():
        rows = rows.filter(user_id=int(user))
    elif user:
        rows = rows.filter(Q(identifier__icontains=user) | Q(user__email__icontains=user))

    search = params.get("search", "").strip()
    if search:
        rows = rows.filter(
            Q(identifier__icontains=search)
            | Q(ip_address__startswith=search)
            | Q(country__icontains=search)
            | Q(city__icontains=search)
        )

    ordering = params.get("ordering", "")
    if ordering.lstrip("-") in ORDERING_FIELDS:
        rows = rows.order_by(ordering, "-id")
    return rows


class StaffOnly(generics.GenericAPIView):
    """Every view below: office staff and admins, nobody else."""

    permission_classes = [IsStaff]


class LoginActivityList(generics.ListAPIView, StaffOnly):
    """The table: one page of attempts, filtered and sorted."""

    serializer_class = LoginActivitySerializer

    def get_queryset(self):
        return filter_rows(base_rows(), self.request.query_params)


class Stats(StaffOnly):
    """The cards above the map. Counted from the same rows as the table."""

    def get(self, request):
        rows = filter_rows(base_rows(), request.query_params)
        now = timezone.now()
        suspicious = [LoginActivity.Security.SUSPICIOUS, LoginActivity.Security.BLOCKED]

        counts = rows.aggregate(
            total=Count("id"),
            successful=Count("id", filter=Q(status=LoginActivity.Status.SUCCESS)),
            failed=Count("id", filter=Q(status=LoginActivity.Status.FAILED)),
            suspicious=Count("id", filter=Q(security_status__in=suspicious)),
            last_24h=Count("id", filter=Q(created_at__gte=now - timedelta(hours=24))),
        )
        counts["unique_users"] = rows.exclude(user__isnull=True).values("user").distinct().count()
        counts["unique_countries"] = (
            rows.exclude(country_code="").values("country_code").distinct().count()
        )
        # Sessions that exist right now and have not expired. This is a real
        # count of the django_session table, so it also includes customers who
        # are signed in; it does not depend on the filters above.
        counts["active_sessions"] = Session.objects.filter(expire_date__gt=now).count()
        # How long records are kept, so the page can say so without guessing.
        counts["retention_days"] = settings.LOGIN_ACTIVITY_RETENTION_DAYS
        return Response(counts)


class MapData(StaffOnly):
    """The markers, the heatmap and the attempts whose place is unknown."""

    def get(self, request):
        rows = filter_rows(base_rows(), request.query_params)

        located = rows.filter(latitude__isnull=False, longitude__isnull=False)
        points = list(located.order_by("-created_at", "-id")[:MAP_LIMIT])
        total_located = located.count()

        # The heatmap: how many attempts per spot, so a busy office counts as
        # one hot spot rather than a thousand identical points.
        heat = [
            {"lat": row["latitude"], "lng": row["longitude"], "count": row["n"]}
            for row in located.order_by()
            .values("latitude", "longitude")
            .annotate(n=Count("id"))
            .order_by("-n")[:MAP_LIMIT]
        ]

        unknown = rows.filter(Q(latitude__isnull=True) | Q(longitude__isnull=True))
        return Response(
            {
                "points": LoginActivitySerializer(points, many=True).data,
                "heat": heat,
                "truncated": total_located > len(points),
                "unknown": {
                    "count": unknown.count(),
                    "latest": LoginActivitySerializer(unknown.order_by("-created_at", "-id")[:10], many=True).data,
                },
            }
        )


class Suspicious(generics.ListAPIView, StaffOnly):
    """Attempts that crossed a threshold or came from a blocked address, the
    ones nobody has reviewed yet first."""

    serializer_class = LoginActivitySerializer

    def get_queryset(self):
        rows = base_rows().filter(
            security_status__in=[LoginActivity.Security.SUSPICIOUS, LoginActivity.Security.BLOCKED]
        )
        reviewed = self.request.query_params.get("reviewed")
        if reviewed == "0":
            rows = rows.filter(reviewed_at__isnull=True)
        elif reviewed == "1":
            rows = rows.filter(reviewed_at__isnull=False)
        # Unreviewed first, then newest. nulls_first is spelled out because
        # SQLite and PostgreSQL disagree about where NULL sorts by default.
        return rows.order_by(F("reviewed_at").asc(nulls_first=True), "-created_at", "-id")


class Review(StaffOnly):
    """POST: "an administrator has looked at this flagged attempt"."""

    def post(self, request, pk):
        row = get_object_or_404(LoginActivity, pk=pk)
        if row.reviewed_at is None:
            row.reviewed_at = timezone.now()
            row.reviewed_by = request.user
            row.save(update_fields=["reviewed_at", "reviewed_by"])
        return Response(LoginActivitySerializer(row).data)


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------

CSV_COLUMNS = [
    ("Time", lambda r: timezone.localtime(r.created_at).strftime("%Y-%m-%d %H:%M:%S")),
    ("Account", lambda r: r.identifier),
    ("IP address", lambda r: r.ip_address or ""),
    ("Country", lambda r: r.country),
    ("Region", lambda r: r.region),
    ("City", lambda r: r.city),
    ("Device", lambda r: r.device_label),
    ("Browser", lambda r: r.browser),
    ("Method", lambda r: r.method),
    ("Status", lambda r: r.get_status_display()),
    ("Security status", lambda r: r.get_security_status_display()),
    ("Flags", lambda r: " ".join(r.flags or [])),
]


def safe_cell(value):
    """Stop a spreadsheet running text as a formula.

    The account column holds whatever somebody typed into the sign-in form. A
    stranger could type =HYPERLINK(...) there, and Excel would run it when an
    administrator opened the export. A cell that starts with = + - @ (or a tab
    or carriage return) gets a ' in front, which makes it plain text.
    """
    text = "" if value is None else str(value)
    if text[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text
    return text


class _Echo:
    """csv.writer needs something with .write(); this just hands the text back
    so the rows can be streamed instead of built up in memory."""

    def write(self, value):
        return value


class Export(StaffOnly):
    """GET: the filtered attempts as a CSV file.

    Login records are personal data, so the download is guarded more than the
    page that shows them:

      * staff only, like everything here;
      * the person must have confirmed their password lately (the same "Confirm
        it's you" step as other sensitive admin actions, accounts/reauth.py);
      * a rate limit (login_activity_export in settings);
      * at most EXPORT_LIMIT rows;
      * every download is written to the server log (who, how many rows);
      * never cached by the browser or a proxy.

    ?check=1 only runs those checks and says how many rows the file would have.
    The page calls it first, so the "confirm it's you" box can appear before the
    browser navigates to the real download.
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login_activity_export"

    def get(self, request):
        require_recent_reauth(request)

        rows = filter_rows(base_rows(), request.query_params)
        if request.query_params.get("check"):
            return Response({"ok": True, "rows": min(rows.count(), EXPORT_LIMIT)}, status=status.HTTP_200_OK)

        rows = rows[:EXPORT_LIMIT]
        logger.info("Login activity export by staff account %s.", request.user.pk)

        writer = csv.writer(_Echo())

        def lines():
            # A byte-order mark, so Excel opens the file as UTF-8 (city names
            # with accents).
            yield "﻿" + writer.writerow([name for name, _ in CSV_COLUMNS])
            for row in rows.iterator(chunk_size=1000):
                yield writer.writerow([safe_cell(get(row)) for _, get in CSV_COLUMNS])

        response = StreamingHttpResponse(lines(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="login-activity-{timezone.localdate():%Y%m%d}.csv"'
        )
        response["Cache-Control"] = "no-store"
        return response
