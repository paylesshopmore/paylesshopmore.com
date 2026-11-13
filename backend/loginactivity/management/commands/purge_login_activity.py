"""Delete login records older than the retention period.

    python manage.py purge_login_activity            # delete
    python manage.py purge_login_activity --dry-run  # only say how many

Run it once a day (a scheduled job on the host). The period is
LOGIN_ACTIVITY_RETENTION_DAYS in settings.py (90 by default). Keeping sign-in
records forever would be keeping personal data longer than it is needed.
"""

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from loginactivity.models import LoginActivity


class Command(BaseCommand):
    help = "Delete login activity older than LOGIN_ACTIVITY_RETENTION_DAYS."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Only count, delete nothing.")

    def handle(self, *args, **options):
        days = settings.LOGIN_ACTIVITY_RETENTION_DAYS
        old = LoginActivity.objects.filter(created_at__lt=timezone.now() - timedelta(days=days))
        count = old.count()
        if options["dry_run"]:
            self.stdout.write(f"{count} record(s) older than {days} days would be deleted.")
            return
        old.delete()
        self.stdout.write(f"Deleted {count} record(s) older than {days} days.")
