"""Tests for pre-alerts.

No test talks to a tracking service: SEVENTEEN_TRACK_API_KEY is empty, so
courier tracking is "manual only" and nothing leaves the machine.

What is worth pinning here:
- a valid form saves everything, with the courier tracking and a notification;
- missing or wrong fields, files and duplicates are refused, nothing half-saved;
- a customer sees, cancels and downloads only their own;
- the warehouse scan finds the pre-alert and records its arrival, once;
- the office (not the floor, not a customer) adds it to a shipment.
"""

import shutil
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status

from accounts.models import Address, Package
from config.testing import ThrottleFreeAPITestCase
from notifications.models import Notification
from shops.models import Shop
from tracking.models import CarrierShipment
from tracking.statuses import TrackingStatus

from .models import PreAlert, PreAlertDocument

User = get_user_model()
NUMBER = "3SABC1234567"
PDF = b"%PDF-1.4\n%fake\n"
TEST_MEDIA = tempfile.mkdtemp(prefix="plsm-test-prealerts-")


def pdf(name="factuur.pdf", content=PDF):
    return SimpleUploadedFile(name, content, content_type="application/pdf")


@override_settings(MEDIA_ROOT=TEST_MEDIA, SEVENTEEN_TRACK_API_KEY="")
class PreAlertTestCase(ThrottleFreeAPITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA, ignore_errors=True)

    def setUp(self):
        super().setUp()
        self.customer = User.objects.create_user(
            username="klant", email="klant@example.com", password="a-long-enough-password",
            first_name="Klaas", last_name="Klant",
        )
        self.stranger = User.objects.create_user(
            username="vreemd", email="vreemd@example.com", password="a-long-enough-password"
        )
        self.office = User.objects.create_user(
            username="kantoor", email="kantoor@example.com", password="a-long-enough-password",
            role=User.Role.OFFICE,
        )
        self.address = Address.objects.create(
            user=self.customer, street="Kaya Grandi", house_number="24", city="Willemstad", country="CW"
        )
        self.bol = Shop.objects.create(name="bol.com", url="https://www.bol.com/", is_active=True)

    def form(self, **overrides):
        data = {
            "tracking_number": " 3s abc 1234 567 ",
            "carrier": "postnl",
            "shop": self.bol.pk,
            "description": "Computer motherboard",
            "consignee_name": "Klaas Klant",
            "consignee_address": self.address.pk,
            "declared_value": "149.95",
            "currency": "EUR",
            "restricted_items_confirmed": "true",
        }
        data.update(overrides)
        return {key: value for key, value in data.items() if value is not None}

    def send(self, user=None, files=(), **overrides):
        self.client.force_authenticate(user or self.customer)
        data = self.form(**overrides)
        if files:
            data["documents"] = list(files)
        return self.client.post(reverse("prealert-list"), data, format="multipart")


class SubmitTests(PreAlertTestCase):
    def test_a_valid_pre_alert_is_saved_with_everything(self):
        response = self.send(files=[pdf()])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        prealert = PreAlert.objects.get()
        self.assertTrue(prealert.reference.startswith("PA-"))
        self.assertEqual(prealert.user, self.customer)
        self.assertEqual(prealert.tracking_number, NUMBER)
        self.assertEqual(prealert.shop_name, "bol.com")
        self.assertIn("Willemstad", prealert.consignee_address_text)
        self.assertIsNotNone(prealert.restricted_items_confirmed_at)
        self.assertEqual(prealert.status, PreAlert.Status.SUBMITTED)
        self.assertEqual(prealert.documents.count(), 1)
        # Followed like any courier parcel, and owned by the customer.
        shipment = CarrierShipment.objects.get(prealert=prealert)
        self.assertEqual(shipment.owner, self.customer)
        self.assertEqual(response.data["carrier_tracking"]["reference"], prealert.reference)
        # One notification.
        self.assertEqual(Notification.objects.get(user=self.customer).context["status"], "prealert_submitted")

    def test_not_received_just_because_it_was_registered(self):
        self.send()
        shipment = CarrierShipment.objects.get()
        self.assertNotEqual(shipment.status, TrackingStatus.RECEIVED_AT_WAREHOUSE)
        self.assertIsNone(PreAlert.objects.get().arrived_at)

    def test_without_an_invoice_is_allowed(self):
        self.assertEqual(self.send().status_code, status.HTTP_201_CREATED)

    def test_another_shop_by_name(self):
        response = self.send(shop=None, shop_name="Zalando")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(PreAlert.objects.get().shop_name, "Zalando")

    def test_required_fields(self):
        for field in ("tracking_number", "carrier", "description", "consignee_name"):
            with self.subTest(field=field):
                response = self.send(**{field: ""})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)
        self.assertFalse(PreAlert.objects.exists())

    def test_the_restricted_items_box_must_be_ticked(self):
        response = self.send(restricted_items_confirmed="false")
        self.assertIn("restricted_items_confirmed", response.data)
        self.assertFalse(PreAlert.objects.exists())

    def test_the_value_is_optional(self):
        # None drops the field from the form, as the website now does.
        response = self.send(declared_value=None, currency=None)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(PreAlert.objects.get().declared_value)

    def test_a_value_must_be_positive(self):
        for value in ("0", "-5", "abc"):
            with self.subTest(value=value):
                self.assertIn("declared_value", self.send(declared_value=value).data)

    def test_an_invalid_tracking_number(self):
        self.assertIn("tracking_number", self.send(tracking_number="12").data)

    def test_walk_in_is_not_a_courier(self):
        self.assertIn("carrier", self.send(carrier="walk-in").data)

    def test_somebody_elses_address_is_refused(self):
        theirs = Address.objects.create(user=self.stranger, street="X", house_number="1", city="Y", country="AW")
        self.assertIn("consignee_address", self.send(consignee_address=theirs.pk).data)

    def test_a_duplicate_tracking_number_is_refused_and_sent_twice_is_one(self):
        first = self.send()
        second = self.send()  # a double-click
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PreAlert.objects.count(), 1)
        self.assertEqual(Notification.objects.count(), 1)
        # Another customer gets the same answer, which says nothing about whose.
        third = self.send(user=self.stranger, consignee_address=None)
        self.assertIn("already registered", str(third.data["tracking_number"]))

    def test_a_cancelled_one_does_not_block_the_number(self):
        self.send()
        PreAlert.objects.update(status=PreAlert.Status.CANCELLED)
        CarrierShipment.objects.all().delete()
        self.assertEqual(self.send().status_code, status.HTTP_201_CREATED)

    def test_a_file_that_is_not_what_it_claims_is_refused(self):
        response = self.send(files=[pdf(content=b"<html>not a pdf</html>")])
        self.assertIn("documents", response.data)
        self.assertFalse(PreAlert.objects.exists())

    def test_an_unsupported_type_is_refused(self):
        response = self.send(files=[SimpleUploadedFile("x.docx", b"PK\x03\x04", content_type="application/msword")])
        self.assertIn("documents", response.data)

    def test_too_large_is_refused(self):
        from bookings.models import BookingAttachment

        big = pdf(content=PDF + b"0" * BookingAttachment.MAX_BYTES)
        self.assertIn("documents", self.send(files=[big]).data)

    def test_too_many_files_are_refused(self):
        files = [pdf(f"f{n}.pdf") for n in range(PreAlertDocument.MAX_PER_PREALERT + 1)]
        self.assertIn("documents", self.send(files=files).data)

    def test_a_failure_while_saving_leaves_nothing(self):
        with patch("prealerts.views.notify_submitted", side_effect=RuntimeError("db down")):
            with self.assertRaises(RuntimeError):
                self.send(files=[pdf()])
        self.assertFalse(PreAlert.objects.exists())
        self.assertFalse(CarrierShipment.objects.exists())

    def test_signed_out_is_refused(self):
        self.client.force_authenticate(None)
        response = self.client.post(reverse("prealert-list"), self.form(), format="multipart")
        self.assertIn(response.status_code, (401, 403))


class OwnershipTests(PreAlertTestCase):
    def setUp(self):
        super().setUp()
        self.send(files=[pdf()])
        self.prealert = PreAlert.objects.get()
        self.document = self.prealert.documents.get()

    def test_the_list_shows_only_my_own(self):
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(reverse("prealert-list")).data["count"], 0)

    def test_someone_elses_is_a_404_everywhere(self):
        self.client.force_authenticate(self.stranger)
        for url in (
            reverse("prealert-detail", args=[self.prealert.pk]),
            reverse("prealert-document", args=[self.prealert.pk, self.document.pk]),
        ):
            self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.post(reverse("prealert-cancel", args=[self.prealert.pk])).status_code, 404)

    def test_the_owner_downloads_the_invoice(self):
        self.client.force_authenticate(self.customer)
        response = self.client.get(reverse("prealert-document", args=[self.prealert.pk, self.document.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), PDF)

    def test_the_customer_cancels_while_it_is_on_its_way(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(reverse("prealert-cancel", args=[self.prealert.pk]))
        self.assertEqual(response.data["status"], PreAlert.Status.CANCELLED)

    def test_but_not_once_it_is_with_us(self):
        PreAlert.objects.update(status=PreAlert.Status.ARRIVED)
        self.client.force_authenticate(self.customer)
        response = self.client.post(reverse("prealert-cancel", args=[self.prealert.pk]))
        self.assertEqual(response.status_code, 400)

    def test_customers_cannot_change_the_status_directly(self):
        self.client.force_authenticate(self.customer)
        url = reverse("prealert-detail", args=[self.prealert.pk])
        self.assertEqual(self.client.patch(url, {"status": "arrived"}, format="json").status_code, 405)


class WarehouseTests(PreAlertTestCase):
    scan_url = "/api/staff/intake/scan/"
    arrival_url = "/api/staff/intake/courier-arrival/"

    def setUp(self):
        super().setUp()
        self.send(files=[pdf()])
        self.prealert = PreAlert.objects.get()

    def test_the_scan_finds_the_pre_alert_and_says_whose_it_is(self):
        self.client.force_authenticate(self.office)
        data = self.client.get(self.scan_url, {"code": NUMBER}).data
        self.assertEqual(data["courier"]["prealert_reference"], self.prealert.reference)
        self.assertEqual(data["courier"]["customer"], "Klaas Klant")
        self.assertEqual(data["courier"]["invoice_files"], 1)
        self.assertFalse(data["courier"]["arrived"])

    def test_an_unknown_number_finds_nothing(self):
        self.client.force_authenticate(self.office)
        data = self.client.get(self.scan_url, {"code": "UNKNOWN99999"}).data
        self.assertEqual(data["match"], "none")
        self.assertIsNone(data["courier"])

    def test_confirming_arrival_updates_the_pre_alert_once(self):
        self.client.force_authenticate(self.office)
        self.client.post(self.arrival_url, {"code": NUMBER}, format="json")
        again = self.client.post(self.arrival_url, {"code": NUMBER}, format="json")

        self.assertTrue(again.data["already"])
        self.prealert.refresh_from_db()
        self.assertEqual(self.prealert.status, PreAlert.Status.ARRIVED)
        self.assertEqual(self.prealert.arrived_by, self.office)

    def test_the_office_adds_it_to_the_customers_shipment_only(self):
        mine = Package.objects.create(user=self.customer, tracking_number="PLSM-00042")
        Package.objects.create(user=self.stranger, tracking_number="PLSM-00043")
        self.client.force_authenticate(self.office)
        url = reverse("staff-prealert-add-to-shipment", args=[self.prealert.pk])

        refused = self.client.post(url, {"package": "PLSM-00043"}, format="json")
        self.assertEqual(refused.status_code, 400)

        added = self.client.post(url, {"package": "plsm-00042"}, format="json")
        self.assertEqual(added.data["status"], PreAlert.Status.IN_SHIPMENT)
        self.prealert.refresh_from_db()
        self.assertEqual(self.prealert.package, mine)

    def test_the_office_sees_and_searches_them(self):
        self.client.force_authenticate(self.office)
        for term in (self.prealert.reference, "3sabc", "klant@example", "motherboard"):
            with self.subTest(term=term):
                rows = self.client.get(reverse("staff-prealert-list"), {"search": term}).data["results"]
                self.assertEqual([row["id"] for row in rows], [self.prealert.pk])

    def test_customers_cannot_reach_the_office_list(self):
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get(reverse("staff-prealert-list")).status_code, 403)


class TrackBoxTests(PreAlertTestCase):
    def test_the_reference_in_the_e_mail_finds_it(self):
        self.send()
        reference = PreAlert.objects.get().reference
        self.client.force_authenticate(self.customer)
        data = self.client.get(reverse("track", args=[reference])).data
        self.assertEqual(data["kind"], "courier")
        self.assertEqual(data["reference"], reference)


@override_settings(OPENAI_API_KEY="test-key")
class PreAlertReadTests(PreAlertTestCase):
    """Filling the form from a screenshot (reading.py), with OpenAI faked."""

    def read(self, answer, user=None, file=None):
        import json
        from types import SimpleNamespace

        self.client.force_authenticate(user or self.customer)
        with patch("openai.OpenAI") as client_class:
            client_class.return_value.responses.create.return_value = SimpleNamespace(
                output_text=json.dumps(answer)
            )
            response = self.client.post(
                reverse("prealert-read"), {"file": file or pdf()}, format="multipart"
            )
        return response, client_class

    def answer(self, **overrides):
        return {
            "text": "Bedankt voor uw bestelling bij Bol.com. PostNL track & trace: 3SABC1234567",
            "tracking_number": "3SABC1234567",
            "carrier_name": "PostNL",
            "shop_name": "Bol.com",
            "items": "1 computer motherboard",
            **overrides,
        }

    def test_the_form_comes_back_filled_and_nothing_is_saved(self):
        response, _ = self.read(self.answer())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json(),
            {
                "tracking_number": "3SABC1234567",
                "carrier": "postnl",
                "shop": self.bol.pk,
                "shop_name": "",
                "description": "1 computer motherboard",
            },
        )
        self.assertFalse(PreAlert.objects.exists())

    def test_a_number_that_is_not_in_the_document_is_dropped(self):
        response, _ = self.read(self.answer(tracking_number="3SXYZ0000000"))
        self.assertEqual(response.json()["tracking_number"], "")

    def test_an_unknown_shop_becomes_other_and_an_unknown_courier_stays_open(self):
        response, _ = self.read(self.answer(shop_name="Kleine Webwinkel", carrier_name="Pigeon Post"))
        data = response.json()
        self.assertIsNone(data["shop"])
        self.assertEqual(data["shop_name"], "Kleine Webwinkel")
        self.assertEqual(data["carrier"], "")

    def test_only_files_a_pre_alert_accepts(self):
        exe = SimpleUploadedFile("virus.exe", b"MZ\x90\x00", content_type="application/octet-stream")
        response, client_class = self.read(self.answer(), file=exe)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        client_class.assert_not_called()

    def test_signed_out_visitors_cannot_use_it(self):
        response = self.client.post(reverse("prealert-read"), {"file": pdf()}, format="multipart")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    @override_settings(OPENAI_API_KEY="")
    def test_without_a_key_it_is_a_503(self):
        response, _ = self.read(self.answer())
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)


class CompanyAddressTests(PreAlertTestCase):
    """Delivering to the PayLesShopMore address instead of a home address."""

    def test_the_company_address_is_written_on_the_pre_alert(self):
        response = self.send(consignee_address=None, deliver_to_company="true")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        prealert = PreAlert.objects.get()
        self.assertIsNone(prealert.consignee_address)
        self.assertIn("Hertzstraat 10", prealert.consignee_address_text)
        self.assertIn("Berkel en Rodenrijs", prealert.consignee_address_text)

    def test_it_wins_over_an_address_sent_along(self):
        self.send(deliver_to_company="true")
        prealert = PreAlert.objects.get()
        self.assertIsNone(prealert.consignee_address)
        self.assertIn("Hertzstraat 10", prealert.consignee_address_text)

    def test_without_it_the_customers_own_address_is_kept(self):
        self.send()
        self.assertIn("Willemstad", PreAlert.objects.get().consignee_address_text)
