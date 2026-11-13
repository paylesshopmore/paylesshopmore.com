"""Turning an IP address into an approximate place, with a cache.

READ THIS FIRST
===============

An IP address says roughly WHERE a connection comes from - usually the city,
often only the region, sometimes the internet provider's head office instead.
It is never a street and never the person's GPS position, and this module
never asks the browser for one. The map is built on that honest, approximate
answer.

HOW A LOOKUP GOES (locate(ip))
------------------------------
  1. A private or local address (127.0.0.1, 192.168.x.x, ...) means nothing on
     a map and is never sent anywhere. -> None
  2. LOGIN_GEO_PROVIDER = "none" switches lookups off. -> None
  3. The cache (7 days) already knows this address? Use it.
  4. A past sign-in from the same address already has a place? Use that too.
     (This survives a cleared cache, so each address is looked up ONCE.)
  5. Only then ask the provider, and remember the answer - an empty answer too,
     for a shorter time, so a failing provider is not hammered.

PROVIDERS (settings.LOGIN_GEO_PROVIDER)
---------------------------------------
  "maxmind"  A MaxMind GeoLite2 City database file on OUR server
             (LOGIN_GEO_MAXMIND_PATH). Nothing leaves the server, which is
             the best choice for privacy. Needs `pip install geoip2` and the
             free database from maxmind.com.
  "ipwhois"  The ipwho.is web service over HTTPS, no key needed. The visitor's
             IP address IS sent to that service - the privacy statement says so.
  "none"     No lookups; every place is unknown.

A lookup never raises and never takes longer than the timeout: a slow or broken
provider must not stop anybody from signing in.
"""

import json
import logging
import urllib.request

from django.conf import settings
from django.core.cache import cache

from .client import is_public_ip

logger = logging.getLogger(__name__)

FOUND_TTL = 7 * 24 * 3600  # an address rarely moves: a week
MISSING_TTL = 3600  # a failed lookup is retried after an hour


def _round(value):
    """2 decimals is about 1 km: all an IP address can honestly claim."""
    return None if value is None else round(float(value), 2)


def _clean(country="", country_code="", region="", city="", latitude=None, longitude=None):
    """One shape for every provider, or None when there is no position."""
    if latitude is None or longitude is None:
        return None
    return {
        "country": (country or "")[:100],
        "country_code": (country_code or "")[:2].upper(),
        "region": (region or "")[:100],
        "city": (city or "")[:100],
        "latitude": _round(latitude),
        "longitude": _round(longitude),
    }


def _ipwhois(ip):
    """ipwho.is: https://ipwho.is/<ip> - JSON, no key, HTTPS."""
    timeout = getattr(settings, "LOGIN_GEO_TIMEOUT_SECONDS", 3)
    url = f"https://ipwho.is/{ip}?fields=success,country,country_code,region,city,latitude,longitude"
    request = urllib.request.Request(url, headers={"User-Agent": "PayLesShopMore-login-monitor"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed https URL
        data = json.loads(response.read(20_000).decode("utf-8"))
    if not data.get("success"):
        return None
    return _clean(
        data.get("country"),
        data.get("country_code"),
        data.get("region"),
        data.get("city"),
        data.get("latitude"),
        data.get("longitude"),
    )


def _maxmind(ip):
    """A GeoLite2-City.mmdb file on this server. Nothing is sent anywhere."""
    path = getattr(settings, "LOGIN_GEO_MAXMIND_PATH", "")
    if not path:
        return None
    try:
        import geoip2.database  # optional dependency
    except ImportError:
        logger.warning("LOGIN_GEO_PROVIDER is 'maxmind' but the geoip2 package is not installed.")
        return None
    with geoip2.database.Reader(path) as reader:
        record = reader.city(ip)
    return _clean(
        record.country.name,
        record.country.iso_code,
        record.subdivisions.most_specific.name,
        record.city.name,
        record.location.latitude,
        record.location.longitude,
    )


# Looked up by name at call time, so a test can swap one in.
PROVIDERS = {"ipwhois": _ipwhois, "maxmind": _maxmind}


def _from_past_sign_ins(ip):
    """A place we already learned for this address from an earlier attempt."""
    from .models import LoginActivity

    row = (
        LoginActivity.objects.filter(ip_address=ip, latitude__isnull=False)
        .order_by("-created_at")
        .first()
    )
    if row is None:
        return None
    return _clean(row.country, row.country_code, row.region, row.city, row.latitude, row.longitude)


def locate(ip):
    """The approximate place of an IP address, or None. See the top of the file."""
    if not ip or not is_public_ip(ip):
        return None

    provider_name = getattr(settings, "LOGIN_GEO_PROVIDER", "none")
    if provider_name == "none":
        return None

    key = f"loginactivity:geo:{ip}"
    cached = cache.get(key)
    if cached is not None:
        # {} is a remembered "could not find out".
        return cached or None

    place = _from_past_sign_ins(ip)
    if place is None:
        provider = PROVIDERS.get(provider_name)
        if provider is not None:
            try:
                place = provider(ip)
            except Exception as error:  # noqa: BLE001 - a broken lookup must never break a sign-in
                # Only the kind of error, never the traceback: the traceback
                # would carry the lookup URL, and so the visitor's address,
                # into the log files.
                logger.warning("Geolocation lookup failed (%s).", type(error).__name__)
                place = None

    cache.set(key, place or {}, FOUND_TTL if place else MISSING_TTL)
    return place
