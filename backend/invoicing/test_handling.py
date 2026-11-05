"""The handling costs: EUR 50 up to and including EUR 500 purchase value,
EUR 150 above that (covering 2 suppliers). One rule, read by the website's
calculator and by the office's bookings alike."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework import status

from bookings.models import Booking, BookingOrder, BookingProduct
from bookings.tests import payload
from config.testing import ThrottleFreeAPITestCase

from .calculation import handling_fee

User = get_user_model()


class HandlingFeeRuleTests(SimpleTestCase):
    def test_the_examples(self):
        for value, fee in (
            ("100", "50.00"),
            ("250", "50.00"),
            ("500", "50.00"),
            ("500.00", "50.00"),
            ("500.01", "150.00"),
            ("501", "150.00"),
            ("750", "150.00"),
            ("1000", "150.00"),
            ("0", "50.00"),
        ):
            with self.subTest(value=value):
                self.assertEqual(handling_fee(Decimal(value))["fee_eur"], Decimal(fee))

    def test_no_value_no_fee(self):
        self.assertIsNone(handling_fee(None))

    def test_a_negative_value_is_refused(self):
        with self.assertRaises(ValueError):
            handling_fee(Decimal("-1"))

    def test_the_150_rate_covers_two_suppliers_without_inventing_a_price_for_more(self):
        two = handling_fee(Decimal("750"), suppliers=2)
        three = handling_fee(Decimal("750"), suppliers=3)
        self.assertEqual(two["suppliers_included"], 2)
        self.assertFalse(two["over_supplier_limit"])
        self.assertTrue(three["over_supplier_limit"])
        # Flagged, not charged: no price has been approved for a third supplier.
        self.assertEqual(three["fee_eur"], Decimal("150.00"))


class HandlingFeeEndpointTests(ThrottleFreeAPITestCase):
    url = reverse("pricing-handling")

    def test_the_rules_are_public(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["rules"],
            [
                {"up_to_eur": "500.00", "fee_eur": "50.00", "suppliers_included": None},
                {"up_to_eur": None, "fee_eur": "150.00", "suppliers_included": 2},
            ],
        )

    def test_it_works_out_a_value(self):
        self.assertEqual(self.client.get(self.url, {"value": "500"}).data["handling"]["fee_eur"], "50.00")
        self.assertEqual(self.client.get(self.url, {"value": "500,01"}).data["handling"]["fee_eur"], "150.00")

    def test_nonsense_is_refused(self):
        for value in ("abc", "-5", "NaN", "1e99"):
            with self.subTest(value=value):
                response = self.client.get(self.url, {"value": value})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class BookingHandlingTests(ThrottleFreeAPITestCase):
    """The customer and the office read the same handling costs, worked out
    on the server."""

    def setUp(self):
        self.customer = User.objects.create_user(
            username="klant@example.com", email="klant@example.com", password="a-long-enough-password"
        )
        self.office = User.objects.create_user(
            username="kantoor@example.com",
            email="kantoor@example.com",
            password="a-long-enough-password",
            is_staff=True,
        )
        # A complete booking as the form makes it, without a value yet.
        fields = payload()
        fields.pop("value_eur")
        self.booking = Booking.objects.create(user=self.customer, **fields)

    def add_stores(self, count):
        for index in range(count):
            BookingOrder.objects.create(
                booking=self.booking, shop_name=f"Shop {index}", description="Goods", position=index
            )

    def read(self, user):
        self.client.force_authenticate(user)
        if user.is_staff:
            return self.client.get(reverse("staff-booking-detail", args=[self.booking.pk])).data
        return self.client.get(reverse("my-bookings")).data[0]

    def test_from_the_booking_value(self):
        self.booking.value_eur = Decimal("750.00")
        self.booking.save()
        self.add_stores(3)

        office = self.read(self.office)
        customer = self.read(self.customer)

        self.assertEqual(office["handling"]["fee_eur"], "150.00")
        self.assertEqual(office["supplier_count"], 3)
        self.assertTrue(office["handling"]["over_supplier_limit"])
        self.assertEqual(customer["handling"]["fee_eur"], office["handling"]["fee_eur"])

    def test_exactly_500_is_the_lower_rate(self):
        self.booking.value_eur = Decimal("500.00")
        self.booking.save()
        self.assertEqual(self.read(self.office)["handling"]["fee_eur"], "50.00")

    def test_from_the_products_when_the_office_has_no_value_yet(self):
        self.add_stores(1)
        order = self.booking.orders.get()
        BookingProduct.objects.create(
            booking=self.booking, order=order, description="TV",
            customer_price_eur=Decimal("300.00"), quantity=2,
        )
        handling = self.read(self.office)["handling"]
        self.assertEqual(handling["purchase_value_eur"], "600.00")
        self.assertEqual(handling["fee_eur"], "150.00")
        self.assertEqual(handling["value_source"], "products")

    def test_nothing_to_go_on(self):
        self.assertIsNone(self.read(self.office)["handling"])
