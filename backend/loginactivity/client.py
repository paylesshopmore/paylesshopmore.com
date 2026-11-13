"""Who is on the other end of a request: their IP address, browser and device.

READ THIS FIRST
===============

Two small, separate jobs.

1. client_ip(request)      - the visitor's IP address, read SAFELY.
2. describe_user_agent(ua) - "Chrome on Windows, desktop" from the browser's
                             User-Agent text.

WHY THE IP ADDRESS NEEDS CARE
-----------------------------
The site runs behind a proxy, so the address Django sees (REMOTE_ADDR) is the
proxy's, and the visitor's real address travels in the X-Forwarded-For header.
That header is just text the CLIENT can write: anybody can send
"X-Forwarded-For: 1.2.3.4" and pretend to be somewhere else. A security log
that believes it is a log of lies.

So the rule here is the same one Django REST framework's throttles use, with
one stricter step:

* DJANGO_NUM_PROXIES is set (the number of trusted proxies in front of us):
  count that many entries from the RIGHT of X-Forwarded-For. The proxies we
  trust wrote those entries, the client could not. (On DigitalOcean the
  TrustedClientIPMiddleware in config/client_ip.py has already put the one
  real address in the header.)
* DJANGO_NUM_PROXIES is NOT set: do not look at X-Forwarded-For at all, use
  REMOTE_ADDR. (DRF would trust the whole header here; for a security log
  that is the wrong default.)

Anything that is not a valid IP address becomes None.
"""

import ipaddress
import re

from rest_framework.settings import api_settings


def _valid(value):
    """The address as a clean string, or None when it is not one."""
    try:
        return str(ipaddress.ip_address((value or "").strip()))
    except ValueError:
        return None


def client_ip(request):
    """The visitor's IP address, or None. See the top of this file."""
    meta = request.META
    remote = _valid(meta.get("REMOTE_ADDR"))
    proxies = api_settings.NUM_PROXIES
    forwarded = meta.get("HTTP_X_FORWARDED_FOR", "")

    if not proxies or not forwarded:
        # No trusted proxy configured (or nothing forwarded): the address on
        # the connection itself is the only one that cannot be written by the
        # client.
        return remote

    entries = [part.strip() for part in forwarded.split(",") if part.strip()]
    if not entries:
        return remote
    # Count from the right: the last `proxies` entries were added by proxies
    # we trust, so the first of them is the client as the first trusted proxy
    # saw it.
    return _valid(entries[-min(proxies, len(entries))]) or remote


def is_public_ip(ip):
    """False for addresses that mean nothing on a map: 127.0.0.1, 192.168.x.x,
    10.x.x.x and the like. Those are never sent to a geolocation service."""
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return address.is_global


# ---------------------------------------------------------------------------
# Browser, operating system and device
# ---------------------------------------------------------------------------

# Checked in order: the first one that matches wins. Order matters because
# nearly every browser's text also contains "Chrome" or "Safari".
_BROWSERS = [
    (r"Edg(?:e|A|iOS)?/", "Edge"),
    (r"OPR/|Opera", "Opera"),
    (r"SamsungBrowser/", "Samsung Internet"),
    (r"Firefox/|FxiOS/", "Firefox"),
    (r"Chrome/|CriOS/", "Chrome"),
    (r"Safari/", "Safari"),
    (r"Trident/|MSIE ", "Internet Explorer"),
]

_BOTS = re.compile(r"bot|crawler|spider|curl/|wget|python-requests|httpclient|postman|insomnia", re.I)


def _os_name(ua):
    # A browser cannot tell Windows 10 from Windows 11 in its User-Agent (both
    # say "Windows NT 10.0"), so we do not pretend to.
    if "Windows NT 10.0" in ua:
        return "Windows 10/11"
    if "Windows" in ua:
        return "Windows"
    if "iPhone" in ua:
        return "iPhone (iOS)"
    if "iPad" in ua:
        return "iPad (iOS)"
    if "Android" in ua:
        return "Android"
    if "CrOS" in ua:
        return "ChromeOS"
    if "Mac OS X" in ua or "Macintosh" in ua:
        return "macOS"
    if "Linux" in ua:
        return "Linux"
    return ""


def describe_user_agent(user_agent):
    """{"browser": ..., "os": ..., "device_type": ...} from a User-Agent text.

    Never raises: an empty or strange header just gives blanks. The raw text is
    NOT stored - only these three short, coarse labels.
    """
    ua = (user_agent or "")[:500]
    if not ua:
        return {"browser": "", "os": "", "device_type": ""}

    browser = ""
    for pattern, name in _BROWSERS:
        if re.search(pattern, ua):
            browser = name
            break

    if _BOTS.search(ua):
        device = "bot"
    elif "iPad" in ua or "Tablet" in ua or ("Android" in ua and "Mobile" not in ua):
        device = "tablet"
    elif "Mobi" in ua or "iPhone" in ua:
        device = "mobile"
    else:
        device = "desktop"

    return {"browser": browser, "os": _os_name(ua), "device_type": device}
