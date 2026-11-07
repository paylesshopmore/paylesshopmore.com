"""python manage.py check_storage - is the upload storage really working?

Uploads (package and damage photos, intake photos, invoice PDFs, documents)
go to the DigitalOcean Space when AWS_STORAGE_BUCKET_NAME is set, and to the
container's own disk when it is not - where they are lost at every deploy.

This writes a tiny test file, reads it back, and deletes it again, then says
plainly where uploads are going. Run it once from the App's Console tab after
adding the Space's settings. Nothing a customer can see is touched.
"""

import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Writes, reads and deletes a test file, to check uploads are stored safely."

    def handle(self, *args, **options):
        bucket = getattr(settings, "AWS_STORAGE_BUCKET_NAME", "")
        backend = type(default_storage).__name__

        if bucket:
            endpoint = getattr(settings, "AWS_S3_ENDPOINT_URL", None) or "Amazon S3"
            self.stdout.write(f"Uploads go to the bucket '{bucket}' at {endpoint} ({backend}).")
        else:
            self.stdout.write(
                self.style.WARNING(
                    "Uploads go to this container's own disk. On DigitalOcean they are "
                    "LOST at every deploy. Set AWS_STORAGE_BUCKET_NAME and the other "
                    "AWS_* settings (see DIGITALOCEAN_DEPLOYMENT.md)."
                )
            )

        # A random name in its own folder, so it can never hit a real file.
        name = f"storage-check/{uuid.uuid4().hex}.txt"
        content = b"PayLesShopMore storage check"
        try:
            saved = default_storage.save(name, ContentFile(content))
            with default_storage.open(saved, "rb") as handle:
                read_back = handle.read()
            default_storage.delete(saved)
        except Exception as error:  # any storage or network failure
            raise CommandError(
                f"The storage check FAILED: {error.__class__.__name__}: {error}. "
                "Check the Space's name, endpoint, region and access key."
            ) from error

        if read_back != content:
            raise CommandError("The storage check FAILED: the file read back was not the file written.")

        self.stdout.write(self.style.SUCCESS("OK: a test file was written, read back and deleted."))
