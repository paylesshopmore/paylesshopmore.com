"""The sign-in log: who tried to sign in, from where, and how it went.

READ THIS FIRST
===============

Three tables live here:

* LoginActivity  - one row per sign-in ATTEMPT, successful or not. This is
                   what the office's "Login activity" page (map, cards, table)
                   reads. Written by loginactivity/recorder.py, never by hand.

* SecuritySettings - ONE row holding the numbers that decide when an attempt
                   is flagged ("5 failed tries from one address within 15
                   minutes"). The office can change them in Django's admin
                   without a code change.

* BlockedIP      - addresses that may not sign in at all. Managed in
                   Django's admin. An attempt from one is refused and logged.

WHAT IS NEVER STORED
--------------------
* No password, PIN, code or token - not even a wrong one. The recorder only
  receives the account name that was typed.
* No raw session key. A session key is a credential (whoever has it IS that
  signed-in person), so only a short one-way hash is kept, enough to tell
  "same session" from "another session" and nothing more.
* No precise location. The place comes from the IP address only (city level,
  rounded), never from the browser's GPS.

HOW LONG IT IS KEPT
-------------------
LOGIN_ACTIVITY_RETENTION_DAYS (settings.py, 90 by default). The management
command `purge_login_activity` deletes older rows; run it daily.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class LoginActivity(models.Model):
    """One sign-in attempt."""

    class Status(models.TextChoices):
        SUCCESS = "success", "Successful"
        FAILED = "failed", "Failed"

    # How a "normal" row looks next to a worrying one. The map colours and the
    # "Suspicious" counter are built from this - see loginactivity/security.py
    # for the rules that choose it.
    #
    #   normal      nothing out of the ordinary
    #   notice      worth knowing (a new device, a new country) but NOT a sign
    #               of trouble by itself: people travel and buy new phones
    #   suspicious  crosses one of the configurable thresholds
    #   blocked     came from an address on the block list
    class Security(models.TextChoices):
        NORMAL = "normal", "Normal"
        NOTICE = "notice", "Notice"
        SUSPICIOUS = "suspicious", "Suspicious"
        BLOCKED = "blocked", "Blocked"

    # Who. SET_NULL: erasing an account must not erase the security history,
    # and a failed attempt against an address that is nobody's has no user.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="login_activity",
    )
    # What was typed in the "e-mail / username" box (never the password).
    # Kept for failed attempts too, because "somebody keeps trying
    # john@example.com" is exactly what the office wants to see.
    identifier = models.CharField(max_length=254, blank=True, db_index=True)

    ip_address = models.GenericIPAddressField(null=True, blank=True, db_index=True)

    # Where, from the IP address (loginactivity/geo.py). All blank/null when
    # the place is unknown - a private address, or the lookup failed.
    country = models.CharField(max_length=100, blank=True)
    country_code = models.CharField(max_length=2, blank=True)
    region = models.CharField(max_length=100, blank=True)
    city = models.CharField(max_length=100, blank=True)
    # Rounded to 2 decimals (about 1 km) before saving: the IP address only
    # ever gave a city, so more digits would pretend to know more than we do.
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    # What, from the User-Agent header (loginactivity/client.py).
    browser = models.CharField(max_length=60, blank=True)
    os = models.CharField(max_length=60, blank=True)
    device_type = models.CharField(max_length=20, blank=True)  # desktop / mobile / tablet / bot

    status = models.CharField(max_length=10, choices=Status.choices, db_index=True)
    # "password", "email_code", "pin", "email_pin", "django_admin", ...
    method = models.CharField(max_length=20, blank=True)
    # A short one-way hash of the session key (see the top of this file).
    session_hash = models.CharField(max_length=16, blank=True)

    security_status = models.CharField(
        max_length=12, choices=Security.choices, default=Security.NORMAL, db_index=True
    )
    # Why it was flagged: a list of codes from loginactivity/security.py,
    # e.g. ["many_failures_ip", "new_device"]. Empty for a normal row.
    flags = models.JSONField(default=list, blank=True)

    # An administrator's review of a flagged row. Reviewing does not change
    # the row; it only says "somebody has looked at this".
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "login activity"
        verbose_name_plural = "login activity"
        indexes = [
            # The rules ask "how many failures from this address lately?" and
            # "from this account lately?" on every attempt; these keep that
            # fast however large the table grows.
            models.Index(fields=["ip_address", "status", "-created_at"]),
            models.Index(fields=["identifier", "status", "-created_at"]),
            models.Index(fields=["user", "status", "-created_at"]),
        ]

    def __str__(self):
        who = self.identifier or "unknown"
        return f"{self.get_status_display()} sign-in: {who} from {self.ip_address or '?'}"

    @property
    def has_location(self):
        return self.latitude is not None and self.longitude is not None

    @property
    def device_label(self):
        """"Windows 11" / "iPhone" - what the popup calls the device."""
        return self.os or self.device_type or ""


class SecuritySettings(models.Model):
    """The thresholds for flagging an attempt. ONE row (pk=1).

    Read with SecuritySettings.current(), which creates the row with these
    defaults the first time. Changed in Django's admin.
    """

    # Many failed tries from ONE ADDRESS ...
    failed_per_ip = models.PositiveIntegerField(
        default=5, help_text="Failed attempts from one IP address that count as suspicious."
    )
    # ... or against ONE ACCOUNT ...
    failed_per_account = models.PositiveIntegerField(
        default=5, help_text="Failed attempts against one account that count as suspicious."
    )
    # ... within this many minutes.
    failed_window_minutes = models.PositiveIntegerField(
        default=15, help_text="The time window for the two numbers above."
    )

    # The same account seen in several countries within a short time. A new
    # country on its own is only a notice; this is about being in places that
    # cannot all be true at once.
    countries_threshold = models.PositiveIntegerField(
        default=3, help_text="Different countries for one account that count as suspicious."
    )
    countries_window_minutes = models.PositiveIntegerField(
        default=60, help_text="The time window for the number of countries."
    )

    # "New country" / "new device" are only worth a notice once the account
    # has some normal history to compare with.
    history_min_logins = models.PositiveIntegerField(
        default=3, help_text="Successful sign-ins an account needs before a new country is noticed."
    )

    class Meta:
        verbose_name = "security settings"
        verbose_name_plural = "security settings"

    def __str__(self):
        return "Login security thresholds"

    def save(self, *args, **kwargs):
        # Always the one row, so there is nothing to choose between.
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def current(cls):
        row, _ = cls.objects.get_or_create(pk=1)
        return row


class BlockedIP(models.Model):
    """An address that may not sign in. Managed in Django's admin."""

    ip_address = models.GenericIPAddressField(unique=True)
    reason = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        verbose_name = "blocked IP address"
        verbose_name_plural = "blocked IP addresses"
        ordering = ["ip_address"]

    def __str__(self):
        return self.ip_address
