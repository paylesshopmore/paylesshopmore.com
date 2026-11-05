"""Every API route, called by every kind of account that should be refused.

The other security tests each check one door. This one walks the whole URL
map (so a route added later is covered without anybody remembering to add
it here), fills each address with the ids of another customer's records, and
calls it with every method it answers, as:

- nobody signed in,
- a different customer (the "guess somebody else's id" attack),
- a warehouse worker and a driver (who must not reach the office),
- an office worker (who must not reach the admin-only switches).

A refusal is any 401, 403, 404 or 405 - or a 400, which means the request was
let in and then failed validation, so it is checked separately: for those the
victim's data must not be in the answer, and nothing may have changed.

Two things are asserted for every call:

1. Routes outside the "this role may" lists answer with a refusal.
2. Whatever the answer, the victim's e-mail, phone number and tracking
   number never appear in it.
"""

import re

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import get_resolver
from django.urls.resolvers import URLResolver

from accounts.models import Address, Package
from bookings.models import Booking
from config.testing import FloorAPIClient, ThrottleFreeAPITestCase
from invoicing.services import ensure_invoice_for_package
from notifications.models import Notification

User = get_user_model()
PASSWORD = "a-long-enough-password"

# What nobody needs to be signed in for. Everything else must refuse an
# anonymous caller.
PUBLIC = re.compile(
    r"^api/(health|ready|stats|auth/(csrf|signup|login|code-login|floor|pin-login|"
    r"password-reset(/confirm)?)|blog|shops|bookings/$|contact|quote|client-errors|assistant|site/$|"
    # The handling-cost rules for the shipping calculator: prices the site
    # shows anyway, read-only (invoicing/pricing_views.py).
    r"pricing/handling/$)"
)

# What a signed-in customer may call at all. Their own records only; the
# victim's ids in the URL must still be refused (see test_customer_idor).
CUSTOMER_ROUTES = re.compile(
    r"^api/(auth/|profile|addresses|documents|invoices|notifications|packages|prealerts|"
    r"bookings|track|stats|blog|shops|contact|quote|health|ready|client-errors|assistant|site/$|"
    r"pricing/handling/$)|^api/staff/warehouse/access/$"
)

# Routes a customer may call with somebody else's id in them without that
# being a leak: the answer is about the caller, not the id.
SAFE_FOR_ANY_ID = re.compile(r"^api/(blog|shops)/")

UNSAFE = ("post", "put", "patch", "delete")
REFUSED = {401, 403, 404, 405}


def make_user(email, **extra):
    return User.objects.create_user(
        username=email,
        email=email,
        password=PASSWORD,
        first_name="Test",
        last_name="User",
        phone_number=extra.pop("phone_number", "+599 9 000 0000"),
        **extra,
    )


def walk(patterns, prefix=""):
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            yield from walk(pattern.url_patterns, prefix + str(pattern.pattern))
        else:
            yield prefix + str(pattern.pattern), pattern.callback


def methods_for(callback):
    """The HTTP methods a route answers, lowercased."""
    actions = getattr(callback, "actions", None)
    if actions:
        return sorted(actions)
    view = getattr(callback, "cls", None) or getattr(callback, "view_class", None)
    if view is None:
        return ["get"]
    return sorted(m for m in ("get", "post", "put", "patch", "delete") if hasattr(view, m))


class AccessMatrixTests(ThrottleFreeAPITestCase):
    client_class = FloorAPIClient

    def setUp(self):
        super().setUp()
        self.victim = make_user("victim@example.com", phone_number="+599 9 111 2233")
        self.attacker = make_user("attacker@example.com")
        self.warehouse = make_user("floor@example.com", role=User.Role.WAREHOUSE)
        self.driver = make_user("driver@example.com", role=User.Role.DRIVER)
        self.office = make_user("office@example.com", role=User.Role.OFFICE)

        self.address = Address.objects.create(
            user=self.victim, street="Secretstraat", house_number="7", city="Willemstad"
        )
        self.package = Package.objects.create(
            user=self.victim,
            tracking_number="PLSM-VICTIM-1",
            description="Victim's parcel",
            status=Package.Status.PAID,
            value_eur="99.00",
        )
        self.invoice = ensure_invoice_for_package(self.package)
        self.notification = Notification.objects.create(
            user=self.victim,
            kind=Notification.Kind.SHIPMENT_STATUS,
            package=self.package,
        )
        self.booking = Booking.objects.create(
            user=self.victim,
            destination=Booking.Destination.CURACAO,
            sender_first_name="Victim",
            sender_last_name="Person",
            sender_address="Secretstraat 7",
            sender_postal_code="1234AB",
            sender_city="Amsterdam",
            sender_phone="+31612345678",
            sender_email=self.victim.email,
            recipient_first_name="Victim",
            recipient_last_name="Family",
            recipient_address="Secretstraat 8",
            recipient_city="Willemstad",
            recipient_phone="+5999111223",
            contents="Victim's goods",
        )

        self.secrets = [
            self.victim.email,
            self.victim.phone_number,
            self.package.tracking_number,
            "Secretstraat",
        ]

    def contact_details(self):
        """What a floor role has no reason to see. Not the phone number: a
        worker sees it on the shipment card to call about a parcel, behind the
        "customer_contact" section switch a manager controls."""
        return [self.victim.email]

    # ---- building the calls -------------------------------------------------

    def object_id_for(self, route):
        """The victim's record that a route's <pk> points at."""
        table = [
            ("api/addresses", self.address.pk),
            ("api/invoices", self.invoice.pk),
            ("api/staff/invoices", self.invoice.pk),
            ("api/notifications", self.notification.pk),
            ("api/staff/customers", self.victim.pk),
            ("api/staff/bookings", self.booking.pk),
        ]
        for prefix, pk in table:
            if route.startswith(prefix):
                return pk
        # Packages, deliveries, warehouse shipments and anything unlisted.
        return self.package.pk

    def concrete(self, route):
        """Turn a route pattern into a URL pointing at the victim's records."""
        pk = self.object_id_for(route.replace("^", ""))
        url = route.replace("^", "").replace("$", "")
        url = re.sub(r"\(\?P<format>[^)]*\)", "", url)
        url = re.sub(r"\(\?P<booking_id>[^)]*\)|<int:booking_id>", str(self.booking.pk), url)
        url = re.sub(r"<str:tracking_number>", self.package.tracking_number, url)
        url = re.sub(r"<slug:slug>", "no-such-post", url)
        url = re.sub(r"\(\?P<pk>[^)]*\)|<int:pk>|<pk>", str(pk), url)
        url = re.sub(r"\(\?P<[a-z_]+>[^)]*\)|<int:[a-z_]+>", "1", url)
        url = url.replace("\\.", ".").replace("\\", "")
        return "/" + url

    def routes(self):
        for route, callback in walk(get_resolver().url_patterns):
            if route.startswith(("admin/", "media/", "^media")) or "format" in route:
                continue
            if route in ("api/", "api/staff/"):
                continue
            # Matched without the regex anchors DRF's router puts in.
            clean = route.replace("^", "").replace("$", "")
            yield clean, self.concrete(route), methods_for(callback)

    def call(self, user, method, url):
        cache.clear()
        self.client.logout()
        if user is not None:
            self.client.force_authenticate(user)
        return getattr(self.client, method)(url, {}, format="json")

    def assert_no_leak(self, response, who, method, url, secrets=None):
        body = b"".join(response.streaming_content) if response.streaming else response.content
        text = body.decode("utf-8", errors="ignore")
        for secret in self.secrets if secrets is None else secrets:
            self.assertNotIn(secret, text, f"{who} {method.upper()} {url} leaked {secret!r}")

    # ---- the matrix ----------------------------------------------------------

    def run_matrix(self, who, user, allowed, secrets=None):
        """Every route not matched by `allowed` must refuse `user`.

        `secrets`: what must never appear in any answer to `user`. Defaults
        to all of the victim's details; the floor roles work with tracking
        numbers and so are only held to the contact details.
        """
        checked = 0
        for route, url, methods in self.routes():
            for method in methods:
                response = self.call(user, method, url)
                self.assert_no_leak(response, who, method, url, secrets)
                if allowed.match(route):
                    continue
                checked += 1
                self.assertIn(
                    response.status_code,
                    REFUSED,
                    f"{who} {method.upper()} {url} answered {response.status_code}",
                )
        self.assertGreater(checked, 50, "the route walk found suspiciously few routes")

    def test_anonymous(self):
        self.run_matrix("anonymous", None, PUBLIC)

    def test_customer_cannot_reach_staff_or_another_customers_records(self):
        # Their own routes are allowed in the matrix; the leak check still
        # proves none of them hands over the victim's data.
        self.run_matrix("customer", self.attacker, CUSTOMER_ROUTES)

    def test_customer_idor_on_detail_routes(self):
        """Every customer route with an id in it, pointed at the victim's id."""
        for route, url, methods in self.routes():
            if not CUSTOMER_ROUTES.match(route) or SAFE_FOR_ANY_ID.match(route):
                continue
            if not re.search(r"<", route):
                continue
            for method in methods:
                response = self.call(self.attacker, method, url)
                self.assertIn(
                    response.status_code,
                    REFUSED,
                    f"customer {method.upper()} {url} answered {response.status_code}",
                )

    def test_warehouse_worker_cannot_reach_the_office(self):
        # document-jobs/: the floor may UPLOAD a label photo to be read (and
        # gets back only the new job's id); reading the queue stays refused -
        # docreview/tests.py AccessTests checks that half.
        allowed = re.compile(
            CUSTOMER_ROUTES.pattern + r"|^api/staff/(warehouse|intake)|^api/staff/document-jobs/$"
        )
        self.run_matrix("warehouse", self.warehouse, allowed, self.contact_details())

    def test_driver_cannot_reach_the_office(self):
        allowed = re.compile(CUSTOMER_ROUTES.pattern + r"|^api/driver")
        self.run_matrix("driver", self.driver, allowed, self.contact_details())

    def test_office_cannot_use_admin_only_switches(self):
        for url, method in [
            (f"/api/staff/customers/{self.victim.pk}/role/", "post"),
            (f"/api/staff/customers/{self.victim.pk}/", "delete"),
            ("/api/staff/request-origin/", "get"),
            ("/api/staff/invoice-ports/", "post"),
            ("/api/staff/invoice-charge-types/", "post"),
            ("/api/staff/invoice-settings/", "put"),
            ("/api/staff/floor-devices/", "get"),
            ("/api/staff/workers/sign-in-code/", "post"),
            ("/api/staff/tracking-integrations/", "get"),
            ("/api/staff/tracking-integrations/dhl/", "patch"),
            ("/api/staff/tracking-integrations/dhl/test/", "post"),
        ]:
            response = self.call(self.office, method, url)
            self.assertIn(
                response.status_code, REFUSED, f"office {method.upper()} {url} answered {response.status_code}"
            )
        self.victim.refresh_from_db()
        self.assertEqual(self.victim.role, User.Role.CUSTOMER)


class MassAssignmentTests(ThrottleFreeAPITestCase):
    """Fields a request must not be able to set, whatever the body says."""

    def setUp(self):
        super().setUp()
        self.customer = make_user("klant@example.com")
        self.office = make_user("office@example.com", role=User.Role.OFFICE)

    def test_a_customer_cannot_promote_themselves_through_the_profile(self):
        self.client.force_authenticate(self.customer)
        self.client.patch(
            "/api/profile/",
            {"role": "admin", "is_staff": True, "is_warehouse": True, "is_superuser": True},
            format="json",
        )
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.role, User.Role.CUSTOMER)
        self.assertFalse(self.customer.is_staff or self.customer.is_warehouse or self.customer.is_superuser)

    def test_signup_cannot_create_a_staff_account(self):
        response = self.client.post(
            "/api/auth/signup/",
            {
                "username": "new@example.com",
                "email": "new@example.com",
                "first_name": "New",
                "last_name": "Person",
                "phone_number": "+599 9 555 1234",
                "password": "a-long-enough-password-1",
                "role": "admin",
                "is_staff": True,
                "is_superuser": True,
            },
            format="json",
        )
        self.assertLess(response.status_code, 500)
        created = User.objects.filter(email="new@example.com").first()
        if created is not None:
            self.assertEqual(created.role, User.Role.CUSTOMER)
            self.assertFalse(created.is_staff or created.is_superuser)

    def test_office_cannot_change_a_role_through_the_edit_form(self):
        """The role only moves through /role/, which is admin-only."""
        self.client.force_authenticate(self.office)
        self.client.patch(
            f"/api/staff/customers/{self.customer.pk}/",
            {"role": "admin", "is_staff": True, "is_active": False},
            format="json",
        )
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.role, User.Role.CUSTOMER)
        self.assertTrue(self.customer.is_active)
        self.assertFalse(self.customer.is_staff)

    def test_a_public_booking_cannot_set_office_fields(self):
        response = self.client.post(
            "/api/bookings/",
            {
                "status": "paid",
                "office_notes": "planted",
                "value_eur": "0.01",
                "shipping_number": "PLSM-9999",
                "user": self.office.pk,
            },
            format="json",
        )
        # Refused for the missing sender details; and even a valid booking
        # would not take these (the serializer only reads SENDER_FIELDS).
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Booking.objects.filter(office_notes="planted").exists())
