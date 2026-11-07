"""python manage.py check_storage (ops/management/commands/check_storage.py)."""

import tempfile
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings


class CheckStorageTests(SimpleTestCase):
    def run_check(self):
        out = StringIO()
        call_command("check_storage", stdout=out)
        return out.getvalue()

    def test_on_the_local_disk_it_works_but_warns(self):
        with tempfile.TemporaryDirectory() as folder, override_settings(
            MEDIA_ROOT=folder, AWS_STORAGE_BUCKET_NAME=""
        ):
            output = self.run_check()
        self.assertIn("LOST at every deploy", output)
        self.assertIn("OK: a test file was written, read back and deleted.", output)

    def test_a_failing_storage_is_reported_as_a_failure(self):
        with mock.patch(
            "ops.management.commands.check_storage.default_storage.save",
            side_effect=OSError("access denied"),
        ):
            with self.assertRaisesMessage(CommandError, "FAILED: OSError: access denied"):
                self.run_check()
