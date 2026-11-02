"""The dashboard's Website page: which pages of the public site are switched on.

    GET /api/staff/site-settings/
        {"show_calculator": true}

    PUT /api/staff/site-settings/   {"show_calculator": false}
        Change a switch. ADMINS ONLY.

The switches live on SiteSettings (accounts/models.py), the same row the
Django admin edits under "Site settings". The public site reads them from
GET /api/site/ (accounts/public.py) and hides whatever is off.
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import SiteSettings

from .permissions import IsAdmin

# The switches this page may change. Anything else in the request is ignored.
SWITCHES = ("show_calculator",)


def state(site):
    return {name: getattr(site, name) for name in SWITCHES}


class SiteSettingsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response(state(SiteSettings.load()))

    def put(self, request):
        site = SiteSettings.load()
        for name in SWITCHES:
            if name not in request.data:
                continue
            value = request.data[name]
            # A real true/false only: "false" as a string must not count as on.
            if not isinstance(value, bool):
                return Response({name: ["Must be true or false."]}, status=status.HTTP_400_BAD_REQUEST)
            setattr(site, name, value)
        site.save(update_fields=list(SWITCHES))
        return Response(state(site))
