"""The products under each store on the booking form: a link to the product,
the price the customer paid, how many - and the office's price check beside
it, which the customer never sees."""

import json
import shutil
import tempfile
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status

from config.testing import ThrottleFreeAPITestCase
from shops.models import Shop

from .models import Booking, BookingAttachment, BookingProduct
from .tests import PNG, payload

User = get_user_model()

URL = reverse("booking-create")
TEST_MEDIA = tempfile.mkdtemp(prefix="plsm-test-media-")

SHIRT = {
    "description": "White T-shirt, size L",
    "url": "https://www.bol.com/nl/nl/p/white-t-shirt/9300000001/",
    "customer_price_eur": "19.99",
    "quantity": 2,
}
SHOES = {
    "description": "Black shoes, size 42",
    "url": "https://www.bol.com/nl/nl/p/black-shoes/9300000002/",
    "customer_price_eur": "59.99",
    "quantity": 1,
}


@override_settings(MEDIA_ROOT=TEST_MEDIA)
class BookingProductTests(ThrottleFreeAPITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA, ignore_errors=True)

    def setUp(self):
        self.bol, _ = Shop.objects.get_or_create(
            name="bol.com", defaults={"url": "https://www.bol.com/"}
        )
        self.customer = self.make_user("klant@example.com")
        self.office = self.make_user("kantoor@example.com", is_staff=True)

    def make_user(self, email, **extra):
        return User.objects.create_user(
            username=email, email=email, password="a-long-enough-password", **extra
        )

    def send(self, products, user=None, files=None, description=None):
        order = {"shop": self.bol.pk, "products": products}
        if description is not None:
            order["description"] = description
        data = payload()
        data.pop("contents")
        if user:
            self.client.force_authenticate(user)
        if files:
            data = {k: v for k, v in data.items() if v is not None}
            data["orders"] = json.dumps([order])
            data.update(files)
            response = self.client.post(URL, data, format="multipart")
        else:
            data["orders"] = [order]
            response = self.client.post(URL, data, format="json")
        self.client.force_authenticate(None)
        return response

    # ---- the form --------------------------------------------------------

    def test_several_products_under_one_store(self):
        response = self.send([SHIRT, SHOES])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        booking = Booking.objects.get()
        order = booking.orders.get()
        products = list(order.products.all())
        self.assertEqual([p.description for p in products], [SHIRT["description"], SHOES["description"]])
        self.assertEqual(products[0].booking, booking)
        self.assertEqual(products[0].customer_price_eur, Decimal("19.99"))
        self.assertEqual(products[0].quantity, 2)
        self.assertEqual(products[0].customer_subtotal_eur, Decimal("39.98"))
        self.assertEqual(products[0].verification_status, "not_checked")
        # Without a store description, the products say what was bought.
        self.assertEqual(order.description, "White T-shirt, size L; Black shoes, size 42")
        self.assertIn("bol.com: White T-shirt", booking.contents)

    def test_only_web_links_are_accepted(self):
        for link in (
            "javascript:alert(1)",
            "JaVaScRiPt:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "ftp://example.com/file",
            # Not secure: https only.
            "http://www.bol.com/nl/nl/p/white-t-shirt/9300000001/",
            "java\tscript:alert(1)",
            "https://",
            "www.bol.com/p/1",
        ):
            with self.subTest(link=link):
                response = self.send([{**SHIRT, "url": link}])
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Booking.objects.count(), 0)

    def test_link_and_price_are_optional_but_a_description_is_not(self):
        response = self.send([{"description": "Lamp"}])
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        product = BookingProduct.objects.get()
        self.assertEqual((product.url, product.customer_price_eur, product.quantity), ("", None, 1))

        response = self.send([{"description": "", "url": SHIRT["url"]}])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_price_cannot_be_negative_nor_a_quantity_zero(self):
        self.assertEqual(
            self.send([{**SHIRT, "customer_price_eur": "-1"}]).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(self.send([{**SHIRT, "quantity": 0}]).status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_product_can_carry_its_own_screenshot(self):
        response = self.send(
            [SHIRT, SHOES],
            user=self.customer,
            files={"order_0_product_1_screenshot": SimpleUploadedFile("schoenen.png", PNG)},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        shoes = BookingProduct.objects.get(description=SHOES["description"])
        self.assertEqual(shoes.screenshot.kind, BookingAttachment.Kind.PRODUCT)

        self.client.force_authenticate(self.customer)
        order = self.client.get(reverse("my-bookings")).data[0]["orders"][0]
        # Not mistaken for the store's screenshot, nor for a later document.
        self.assertIsNone(order["screenshot"])
        self.assertEqual(order["documents"], [])
        shot = order["products"][1]["screenshot"]
        self.assertEqual(self.client.get(shot["url"]).status_code, status.HTTP_200_OK)
        # Sent with the form, so it cannot be removed afterwards.
        self.assertEqual(self.client.delete(shot["url"]).status_code, status.HTTP_403_FORBIDDEN)

    # ---- what each side reads ----------------------------------------------

    def test_the_customer_reads_their_products_without_the_office_check(self):
        self.send([SHIRT, SHOES], user=self.customer)
        product = BookingProduct.objects.first()
        product.verified_price_eur = Decimal("24.99")
        product.verification_status = "price_changed"
        product.staff_notes = "Price went up on the site."
        product.save()

        self.client.force_authenticate(self.customer)
        order = self.client.get(reverse("my-bookings")).data[0]["orders"][0]
        self.assertEqual(order["products_subtotal_eur"], "99.97")
        first = order["products"][0]
        self.assertEqual(first["url"], SHIRT["url"])
        self.assertEqual(first["customer_subtotal_eur"], "39.98")
        for hidden in ("staff_notes", "verified_price_eur", "verification_status"):
            self.assertNotIn(hidden, first)

    def test_the_office_sees_the_products_and_the_check(self):
        self.send([SHIRT, SHOES])
        booking = Booking.objects.get()
        self.client.force_authenticate(self.office)
        order = self.client.get(reverse("staff-booking-detail", args=[booking.pk])).data["orders"][0]
        first = order["products"][0]
        self.assertEqual(first["store_name"], "bol.com")
        self.assertEqual(first["verification_status"], "not_checked")
        self.assertEqual(first["customer_price_eur"], "19.99")

    # ---- the office's price check -----------------------------------------

    def product_url(self, product):
        return reverse("staff-booking-product-detail", args=[product.pk])

    def test_the_office_checks_a_price_without_touching_the_customers(self):
        self.send([SHIRT])
        product = BookingProduct.objects.get()
        self.client.force_authenticate(self.office)

        response = self.client.patch(
            self.product_url(product),
            {
                "verified_price_eur": "24.99",
                "verification_status": "price_changed",
                "staff_notes": "Was 19.99 at the time of ordering.",
                # Not the office's to change: ignored.
                "customer_price_eur": "1.00",
                "url": "javascript:alert(1)",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        product.refresh_from_db()
        self.assertEqual(product.verified_price_eur, Decimal("24.99"))
        self.assertEqual(product.customer_price_eur, Decimal("19.99"))
        self.assertEqual(product.url, SHIRT["url"])
        self.assertEqual(product.verification_status, "price_changed")
        self.assertEqual(product.verified_by, self.office)
        self.assertIsNotNone(product.verified_at)
        self.assertEqual(response.data["verification_status_display"], "Price changed")

    def test_only_known_statuses(self):
        self.send([SHIRT])
        product = BookingProduct.objects.get()
        self.client.force_authenticate(self.office)
        response = self.client.patch(
            self.product_url(product), {"verification_status": "cheap"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_nobody_but_the_office_can_check_a_price(self):
        self.send([SHIRT], user=self.customer)
        product = BookingProduct.objects.get()
        warehouse = self.make_user("vloer@example.com", is_warehouse=True)
        for user in (self.customer, warehouse):
            with self.subTest(user=user.email):
                self.client.force_authenticate(user)
                response = self.client.patch(
                    self.product_url(product), {"verification_status": "verified"}, format="json"
                )
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(None)
        response = self.client.patch(
            self.product_url(product), {"verification_status": "verified"}, format="json"
        )
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        product.refresh_from_db()
        self.assertEqual(product.verification_status, "not_checked")

    def test_the_office_lists_one_bookings_products(self):
        self.send([SHIRT, SHOES])
        booking = Booking.objects.get()
        self.client.force_authenticate(self.office)
        response = self.client.get(reverse("staff-booking-product-list"), {"booking": booking.pk})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(rows), 2)
