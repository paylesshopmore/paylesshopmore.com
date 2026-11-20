from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from payments.models import PaymentInvoice

SAMPLES = [
    ("PLSM-10001", 2500),  # 25.00 euro
    ("PLSM-10002", 14999),  # 149.99 euro
    ("PLSM-10003", 50000),  # 500.00 euro
]


class Command(BaseCommand):
    help = "Create three open test invoices to try the payment page with (development only)."

    def handle(self, *args, **options):
        # Made-up invoices do not belong on a live site, so this refuses to
        # run in production.
        if not settings.DEBUG:
            raise CommandError("Only for development (DJANGO_DEBUG=1).")

        for number, amount in SAMPLES:
            _, created = PaymentInvoice.objects.get_or_create(
                number=number, defaults={"amount": amount}
            )
            self.stdout.write(f"{number}: {'created' if created else 'already there'}")
