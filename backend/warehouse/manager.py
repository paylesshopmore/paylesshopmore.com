"""The warehouse manager's dashboard: /warehouse/manager in the app.

Two endpoints, both for admins and warehouse managers only (IsWarehouseManager)
- a warehouse worker gets a 403 from either, whatever the app shows them:

  ManagerStatsView     GET /api/staff/warehouse/manager/stats/
                       The numbers at the top of the dashboard, today's work
                       per worker, and the packages that need somebody.
  ManagerActivityView  GET /api/staff/warehouse/manager/activity/
                       One activity log for the whole warehouse, filterable.

Nothing here writes, and nothing new is stored. Everything is read from the
records the warehouse already keeps:

  FloorEvent       (accounts)   sign-ins, sign-outs, wrong PINs, PIN changes,
                                accounts switched off or on
  PackageActivity  (warehouse)  every action on a package: scanned, received,
                                measured, packed, status changes, problems...

Neither can be edited or deleted through the app or the Django admin, so the
log a manager reads is the log as it happened.
"""

import heapq
from datetime import date as date_type
from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import FloorEvent, Package
from accounts.signin_codes import idle_seconds
from staff.permissions import IsWarehouseManager

from . import report
from .models import (
    IntakeAssignment,
    IntakeSheet,
    PackageActivity,
    PackageDamageReport,
    PackageMeasurement,
)
from .operations import intake_lines

User = get_user_model()
Stage = Package.WarehouseStage

# In the building and not yet ready to go: the stages somebody still has to
# work on. Expected (not here yet), ready and shipped are not "waiting".
WAITING_STAGES = (
    Stage.RECEIVED,
    Stage.AWAITING_MEASUREMENT,
    Stage.MEASURED,
    Stage.AWAITING_PACKAGING,
    Stage.PACKED,
)

# Physically in the warehouse: everything waiting, plus ready to ship.
IN_WAREHOUSE_STAGES = (*WAITING_STAGES, Stage.READY)

# How many packages each "needs attention" list shows. The count beside it is
# the full number; the list is where to start.
ATTENTION_LIMIT = 10

# The activity log, one page at a time.
PAGE_SIZE = 50
# A page number beyond this is refused: each page reads every row before it
# from both tables, and nobody reads 10,000 rows back through a web page -
# that is what the date filter is for.
MAX_PAGE = 200


def _name(user):
    if user is None:
        return None
    return user.get_full_name() or user.email or f"#{user.pk}"


def _person(user):
    return None if user is None else {"id": user.pk, "name": _name(user)}


def _in_warehouse():
    return Package.objects.filter(warehouse_stage__in=IN_WAREHOUSE_STAGES).exclude(
        status=Package.Status.CANCELLED
    )


# ------------------------------------------------------------------ stats


def signed_in_worker_ids():
    """The warehouse workers who are signed in right now.

    A warehouse session ends after WAREHOUSE_SESSION_IDLE_MINUTES without use
    (accounts/views.open_warehouse), and its expiry date is pushed forward on
    every request. So a session whose expiry lies within that window from now
    is one that was used in the last half hour or so, and one that has
    expired is somebody who has gone. Customers' two-week sessions expire far
    later and are not even read.
    """
    now = timezone.now()
    window = timedelta(seconds=idle_seconds() + 60)
    user_ids = set()
    sessions = Session.objects.filter(expire_date__gt=now, expire_date__lte=now + window)
    for session in sessions.iterator():
        user_id = session.get_decoded().get("_auth_user_id")
        if user_id and str(user_id).isdigit():
            user_ids.add(int(user_id))
    if not user_ids:
        return set()
    return set(
        User.objects.filter(
            pk__in=user_ids, role=User.Role.WAREHOUSE, is_active=True
        ).values_list("pk", flat=True)
    )


def _missing_measurements():
    """Packages in the warehouse that nobody has measured yet - neither on the
    package page nor on its intake sheet (operations.is_measured)."""
    measured_on_floor = PackageMeasurement.objects.filter(package=OuterRef("pk"))
    candidates = (
        _in_warehouse()
        .filter(warehouse_stage__in=WAITING_STAGES)
        .exclude(Exists(measured_on_floor))
        .select_related("user")
        .order_by("warehouse_stage_at")
    )
    # The intake-sheet rule ("the newest sheet, every line complete") is
    # checked one package at a time, the same function the package page uses,
    # so this list and that page can never disagree.
    return [package for package in candidates if not intake_lines(package)]


def _brief(package, since=None, note=""):
    return {
        "id": package.pk,
        "tracking_number": package.tracking_number,
        "customer": _name(package.user),
        "stage": package.warehouse_stage,
        "stage_display": package.get_warehouse_stage_display(),
        "since": since or package.warehouse_stage_at,
        "note": note,
    }


def build_stats():
    """Everything the manager's overview shows, as plain data."""
    today = timezone.localdate()

    workers = User.objects.filter(
        role=User.Role.WAREHOUSE, is_active=True, anonymised_at__isnull=True
    )
    signed_in = signed_in_worker_ids()

    received_today = Package.objects.filter(received_at__date=today).count()
    # "Processed" = got all the way to ready for shipping today.
    processed_today = (
        PackageActivity.objects.filter(
            timestamp__date=today, action=PackageActivity.Action.PACKAGE_MARKED_READY
        )
        .values("package")
        .distinct()
        .count()
    )

    waiting = _in_warehouse().filter(warehouse_stage__in=WAITING_STAGES)

    # Goods that arrived with nothing to say whose they are: an intake sheet
    # with no customer, shipment or booking - the "Without a customer" queue
    # (IntakeSheetViewSet ?unassigned=true).
    unassigned = IntakeSheet.objects.filter(
        customer__isnull=True, package__isnull=True, booking__isnull=True
    )

    missing = _missing_measurements()

    problems = (
        _in_warehouse()
        .exclude(problem_note="")
        .select_related("user")
        .order_by("problem_reported_at")
    )
    open_damage = (
        PackageDamageReport.objects.filter(resolution_status=PackageDamageReport.Resolution.OPEN)
        .select_related("package__user")
        .order_by("created_at")
    )

    problem_count = problems.count()
    damage_count = open_damage.count()

    return {
        "date": today.isoformat(),
        "counts": {
            "active_workers": workers.count(),
            "signed_in_now": len(signed_in),
            "received_today": received_today,
            "processed_today": processed_today,
            "waiting": waiting.count(),
            "unassigned": unassigned.count(),
            "missing_measurements": len(missing),
            "problems": problem_count + damage_count,
        },
        # The full size of each "needs attention" list, which shows only the
        # first ATTENTION_LIMIT rows.
        "attention_totals": {
            "problems": problem_count,
            "damage": damage_count,
            "missing_measurements": len(missing),
            "unassigned": unassigned.count(),
        },
        # Who is on right now, by name, for the card that says how many.
        "signed_in": [
            _person(user)
            for user in User.objects.filter(pk__in=signed_in).order_by("first_name", "last_name")
        ],
        # Today's work per worker: the same report the office downloads.
        "today": report.build(today),
        "attention": {
            "problems": [
                _brief(package, package.problem_reported_at, package.problem_note)
                for package in problems[:ATTENTION_LIMIT]
            ],
            "damage": [
                {
                    **_brief(damage.package, damage.created_at, damage.description),
                    "damage_id": damage.pk,
                    "damage_type": damage.get_damage_type_display(),
                }
                for damage in open_damage[:ATTENTION_LIMIT]
            ],
            "missing_measurements": [_brief(package) for package in missing[:ATTENTION_LIMIT]],
            "unassigned": [
                {
                    "id": sheet.pk,
                    "reference": sheet.reference,
                    "supplier": sheet.supplier,
                    "recipient": sheet.recipient,
                    "created_at": sheet.created_at,
                }
                for sheet in unassigned.order_by("created_at")[:ATTENTION_LIMIT]
            ],
        },
    }


class ManagerStatsView(APIView):
    """GET: the manager's overview. Admins and warehouse managers."""

    permission_classes = [IsWarehouseManager]

    def get(self, request):
        return Response(build_stats())


# --------------------------------------------------------------- activity


FLOOR_KINDS = dict(FloorEvent.Kind.choices)
PACKAGE_ACTIONS = dict(PackageActivity.Action.choices)
CUSTOMER_KINDS = dict(IntakeAssignment.Kind.choices)


def _parse_day(value, field):
    if not value:
        return None
    try:
        return date_type.fromisoformat(value)
    except ValueError:
        raise ValidationError({field: ["Use the form YYYY-MM-DD."]}) from None


def _positive_int(value, field):
    if value in (None, ""):
        return None
    if not str(value).isdigit():
        raise ValidationError({field: ["Must be a number."]})
    return int(value)


def _day_bounds(date_from, date_to):
    """The local days as aware datetimes: [start of from, start of day after to)."""
    zone = timezone.get_current_timezone()
    start = datetime.combine(date_from, time.min, zone) if date_from else None
    end = datetime.combine(date_to + timedelta(days=1), time.min, zone) if date_to else None
    return start, end


def _floor_row(event):
    # Who did it: the manager who reset a PIN, or the worker who signed in.
    # When a manager acted on a worker, the worker is the "subject".
    doer = event.actor or event.user
    return {
        "id": f"floor-{event.pk}",
        "source": "floor",
        "at": event.created_at,
        "worker": _person(doer),
        "subject": _person(event.user) if event.actor else None,
        "action": event.kind,
        "action_display": FLOOR_KINDS.get(event.kind, event.kind),
        "package": None,
        "device": event.device.name if event.device else None,
        "description": "",
        "changes": {},
    }


def _package_row(activity):
    return {
        "id": f"package-{activity.pk}",
        "source": "package",
        "at": activity.timestamp,
        "worker": _person(activity.user),
        "subject": None,
        "action": activity.action,
        "action_display": PACKAGE_ACTIONS.get(activity.action, activity.action),
        "package": {
            "id": activity.package_id,
            "tracking_number": activity.package.tracking_number,
        },
        "device": None,
        "description": activity.description,
        # The facts behind the sentence: from/to stage, the measurement that
        # replaced another, the location before and after... Before-and-after
        # values for anything that changed live here.
        "changes": dict(activity.context or {}),
    }


MEASURED_FIELDS = ("weight_kg", "length_cm", "width_cm", "height_cm")


def _add_measurement_changes(rows):
    """Put the numbers before and after into each "measurement changed" row.

    A measurement is never edited: a correction is a new row that supersedes
    the old one (PackageMeasurement), and the log stores only the two ids. A
    manager asking "what did it say before?" wants the numbers, so they are
    looked up here - for the rows on this page only, in one query.
    """
    ids = set()
    for row in rows:
        changes = row["changes"]
        for key in ("measurement_id", "supersedes_id"):
            if isinstance(changes.get(key), int):
                ids.add(changes[key])
    if not ids:
        return
    found = {m.pk: m for m in PackageMeasurement.objects.filter(pk__in=ids)}
    for row in rows:
        changes = row["changes"]
        after = found.get(changes.get("measurement_id"))
        if after is None:
            continue
        before = found.get(changes.get("supersedes_id"))
        for field in MEASURED_FIELDS:
            changes[f"from_{field}"] = str(getattr(before, field)) if before else None
            changes[f"to_{field}"] = str(getattr(after, field))


def _assignment_row(assignment):
    sheet = assignment.sheet
    before = _name(assignment.from_customer)
    after = _name(assignment.to_customer)
    details = [part for part in (assignment.matched_by, assignment.reason) if part]
    return {
        "id": f"customer-{assignment.pk}",
        "source": "customer",
        "at": assignment.created_at,
        "worker": _person(assignment.user),
        "subject": None,
        "action": assignment.kind,
        "action_display": CUSTOMER_KINDS.get(assignment.kind, assignment.kind),
        "package": (
            {"id": assignment.package_id, "tracking_number": assignment.package.tracking_number}
            if assignment.package_id
            else None
        ),
        # The intake sheet the goods are on (a link to it in the app).
        "sheet": {"id": sheet.pk, "reference": sheet.reference},
        "device": None,
        "description": " · ".join(details),
        "changes": {"from_customer": before, "to_customer": after},
    }


def build_activity(params):
    """One page of the merged log, newest first, and what it was filtered by."""
    worker = _positive_int(params.get("worker"), "worker")
    package = _positive_int(params.get("package"), "package")
    action = params.get("action") or ""
    date_from = _parse_day(params.get("date_from"), "date_from")
    date_to = _parse_day(params.get("date_to"), "date_to")
    page = _positive_int(params.get("page"), "page") or 1
    # A tracking number is what a manager has in hand; the id is what links
    # in the app carry. Either narrows to one package.
    tracking = str(params.get("tracking") or "").strip()[:50]
    if tracking and package is None:
        package = (
            Package.objects.filter(tracking_number__iexact=tracking)
            .values_list("pk", flat=True)
            .first()
        )
        if package is None:
            package = 0  # matches nothing: an unknown number shows no rows

    if action and not any(action in kinds for kinds in (FLOOR_KINDS, PACKAGE_ACTIONS, CUSTOMER_KINDS)):
        raise ValidationError({"action": ["Not an action the log knows."]})
    if date_from and date_to and date_from > date_to:
        raise ValidationError({"date_to": ["The end is before the start."]})
    if page > MAX_PAGE:
        raise ValidationError({"page": ["Narrow it down with the dates instead."]})

    start, end = _day_bounds(date_from, date_to)

    # Which of the three tables can hold a matching row at all.
    want_floor = package is None and not tracking and (not action or action in FLOOR_KINDS)
    want_package = not action or action in PACKAGE_ACTIONS
    want_customer = not action or action in CUSTOMER_KINDS

    floor_events = FloorEvent.objects.none()
    if want_floor:
        floor_events = FloorEvent.objects.select_related("user", "device", "actor")
        if worker:
            floor_events = floor_events.filter(Q(user_id=worker) | Q(actor_id=worker))
        if action:
            floor_events = floor_events.filter(kind=action)
        if start:
            floor_events = floor_events.filter(created_at__gte=start)
        if end:
            floor_events = floor_events.filter(created_at__lt=end)
        floor_events = floor_events.order_by("-created_at", "-pk")

    activities = PackageActivity.objects.none()
    if want_package:
        activities = PackageActivity.objects.select_related("user", "package")
        if worker:
            activities = activities.filter(user_id=worker)
        if package is not None:
            activities = activities.filter(package_id=package)
        if action:
            activities = activities.filter(action=action)
        if start:
            activities = activities.filter(timestamp__gte=start)
        if end:
            activities = activities.filter(timestamp__lt=end)
        activities = activities.order_by("-timestamp", "-pk")

    # Goods put under a customer (warehouse/customers.py). The tracking
    # filter also matches the intake sheet's own number, which is what an
    # unidentified box is known by.
    assignments = IntakeAssignment.objects.none()
    if want_customer:
        assignments = IntakeAssignment.objects.select_related(
            "sheet", "package", "user", "from_customer", "to_customer"
        )
        if worker:
            assignments = assignments.filter(user_id=worker)
        if package is not None and tracking:
            assignments = assignments.filter(Q(package_id=package) | Q(sheet__reference__iexact=tracking))
        elif package is not None:
            assignments = assignments.filter(package_id=package)
        if action:
            assignments = assignments.filter(kind=action)
        if start:
            assignments = assignments.filter(created_at__gte=start)
        if end:
            assignments = assignments.filter(created_at__lt=end)
        assignments = assignments.order_by("-created_at", "-pk")

    total = floor_events.count() + activities.count() + assignments.count()

    # Merge the three newest-first lists. Each can contribute at most
    # page * PAGE_SIZE rows to the first `page` pages, so that is all that is
    # read from either.
    upto = page * PAGE_SIZE
    merged = heapq.merge(
        (_floor_row(event) for event in floor_events[:upto]),
        (_package_row(activity) for activity in activities[:upto]),
        (_assignment_row(assignment) for assignment in assignments[:upto]),
        key=lambda row: row["at"],
        reverse=True,
    )
    rows = list(merged)[(page - 1) * PAGE_SIZE : upto]
    _add_measurement_changes(rows)

    return {
        "count": total,
        "page": page,
        "page_size": PAGE_SIZE,
        "has_next": total > upto,
        "results": rows,
    }


def filter_options():
    """What the filter dropdowns offer: the people and the actions."""
    people = (
        User.objects.filter(
            Q(role__in=[User.Role.WAREHOUSE, User.Role.MANAGER, User.Role.ADMIN, User.Role.OFFICE])
            | Q(is_superuser=True)
        )
        .filter(anonymised_at__isnull=True)
        .order_by("first_name", "last_name", "pk")
    )
    return {
        "workers": [
            {"id": user.pk, "name": _name(user), "role": user.role, "is_active": user.is_active}
            for user in people
        ],
        "actions": [
            {"value": value, "label": label, "group": "floor"}
            for value, label in FloorEvent.Kind.choices
        ]
        + [
            {"value": value, "label": label, "group": "package"}
            for value, label in PackageActivity.Action.choices
        ]
        + [
            {"value": value, "label": label, "group": "customer"}
            for value, label in IntakeAssignment.Kind.choices
        ],
    }


class ManagerActivityView(APIView):
    """GET: the warehouse's activity log, newest first.

    Filters, all optional: ?worker=<user id>&action=<kind>&package=<id>
    (or &tracking=<tracking number>)
    &date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&page=<n>. ?options=1 adds what
    the filter dropdowns offer. Admins and warehouse managers.
    """

    permission_classes = [IsWarehouseManager]

    def get(self, request):
        data = build_activity(request.query_params)
        if request.query_params.get("options"):
            data["options"] = filter_options()
        return Response(data)
