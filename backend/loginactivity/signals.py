"""Listening to Django's sign-in signals.

Django already announces two things for us:

  user_logged_in      someone signed in (login() was called)
  user_login_failed   authenticate() was given credentials that did not work

Connecting to them means the existing authentication code is not modified: it
just gets listened to. See recorder.py for what happens next.

The failed signal carries the credentials that were tried, with the password
already blanked out by Django. We still only ever read the account NAME from
them - never anything that could be a secret.
"""

from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.dispatch import receiver

from .models import LoginActivity
from .recorder import method_for, record


@receiver(user_logged_in)
def on_login(sender, request, user, **kwargs):
    # No request (a script calling login() by hand): no address or browser to
    # record, so there is nothing useful to log.
    if request is None:
        return
    record(request, status=LoginActivity.Status.SUCCESS, method=method_for(request), user=user)


@receiver(user_login_failed)
def on_login_failed(sender, credentials, request=None, **kwargs):
    if request is None:
        return
    # Django names the field after the user model's USERNAME_FIELD; accept an
    # e-mail key too. Only the typed account name is read.
    typed = credentials.get("username") or credentials.get("email") or ""
    record(
        request,
        status=LoginActivity.Status.FAILED,
        method=method_for(request),
        identifier=str(typed),
    )
