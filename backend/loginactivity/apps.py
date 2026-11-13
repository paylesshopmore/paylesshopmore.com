from django.apps import AppConfig


class LoginActivityConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "loginactivity"
    verbose_name = "Login activity"

    def ready(self):
        # Connects the "somebody signed in" and "a sign-in failed" signals.
        # Imported here, not at the top, so Django has finished loading the
        # apps before this touches any model.
        from . import signals  # noqa: F401
