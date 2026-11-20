"""The dashboard's editor for the About us page.

    GET /api/staff/about-page/
        {"years_in_business": 14, "headline_nl": "", "headline_en": "", ...}

    PUT /api/staff/about-page/   {"years_in_business": 15, "story_en": "..."}
        Change any of them. ADMINS ONLY. Anything not sent is left alone.

The words live on AboutPage (accounts/models.py), the same row the Django
admin edits under "About page". The public site reads them from
GET /api/about/ (accounts/public.py). A text left empty means "use the
wording built into the website".
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AboutPage

from .permissions import IsAdmin

# The text fields and how long each may be. Anything else in the request is
# ignored, so this page cannot change something it was not meant to.
TEXT_FIELDS = {
    "headline_nl": 200,
    "headline_en": 200,
    "intro_nl": 1000,
    "intro_en": 1000,
    "story_nl": 5000,
    "story_en": 5000,
}
YEARS_RANGE = (1, 200)
FIELDS = ("years_in_business", *TEXT_FIELDS)


def state(about):
    return {name: getattr(about, name) for name in FIELDS}


class AboutPageEditorView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(state(AboutPage.load()))

    def put(self, request):
        about = AboutPage.load()
        errors = {}
        changes = {}

        if "years_in_business" in request.data:
            years = request.data["years_in_business"]
            # A real whole number only: True is an int in Python and "14" is
            # a string, and neither should count.
            low, high = YEARS_RANGE
            if isinstance(years, bool) or not isinstance(years, int) or not low <= years <= high:
                errors["years_in_business"] = [f"Must be a whole number from {low} to {high}."]
            else:
                changes["years_in_business"] = years

        for name, longest in TEXT_FIELDS.items():
            if name not in request.data:
                continue
            value = request.data[name]
            if not isinstance(value, str):
                errors[name] = ["Must be text."]
            elif len(value.strip()) > longest:
                errors[name] = [f"At most {longest} characters."]
            else:
                changes[name] = value.strip()

        # All or nothing: a half-saved page would be worse than a refused one.
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        for name, value in changes.items():
            setattr(about, name, value)
        if changes:
            about.save(update_fields=list(changes))
        return Response(state(about))
