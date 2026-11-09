"""Tests for courier tracking.

No test talks to the real 17TRACK: the provider's HTTP call (SeventeenTrack._post)
is replaced with canned answers shaped like 17TRACK's documented responses, so
the suite runs without an API key or a network.

What is worth pinning here:
- typed numbers are cleaned up, and nonsense is refused;
- a customer can only touch their own orders, and sees no staff-only data;
- fetching the same history twice does not duplicate it;
- failures wait longer each time, and a bad key stops the run loudly;
- webhooks are only believed with the right signature;
- staff corrections keep the history, and "delivered" needs a confirmation.
"""

import hashlib
import json
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from bookings.models import Booking, BookingOrder
from bookings.tests import payload
from config.testing import ThrottleFreeAPITestCase
from notifications.models import Notification

from .models import Carrier, CarrierShipment, TrackingEvent, TrackingSyncLog
from .normalize import InvalidTrackingNumber, normalize_tracking_number
from .providers import CredentialsError, TemporaryProviderError
from .statuses import TrackingStatus, from_seventeen_track
from .sync import sync_due
from .views import valid_seventeen_track_signature

User = get_user_model()
KEY = "test-17track-key"
NUMBER = "3SABC1234567"


def track_object(number=NUMBER, status="InTransit", sub_status="InTransit_Other", events=None):
    """A 17TRACK tracking object, as in gettrackinfo answers and webhook pushes."""
    if events is None:
        events = [
            {
                "time_iso": "2026-10-18T09:00:00+02:00",
                "time_utc": "2026-10-18T07:00:00Z",
                "description": "Parcel received by PostNL",
                "location": "Utrecht",
                "stage": "InTransit",
                "sub_status": "InTransit_PickedUp",
            },
            {
                "time_iso": "2026-10-19T14:02:00+02:00",
                "time_utc": "2026-10-19T12:02:00Z",
                "description": "Parcel sorted",
                "location": "Nieuwegein",
                "stage": "InTransit",
                "sub_status": "InTransit_Other",
            },
        ]
    return {
        "number": number,
        "carrier": 14041,
        "track_info": {
            "latest_status": {"status": status, "sub_status": sub_status},
            "latest_event": events[-1] if events else {},
            "time_metrics": {"estimated_delivery_date": {"from": "2026-10-21", "to": "2026-10-22"}},
            "tracking": {"providers": [{"events": events}]},
        },
    }


def answer(endpoint, accepted=(), rejected=()):
    """What SeventeenTrack._post returns: (data, http_status)."""
    return {"accepted": list(accepted), "rejected": list(rejected)}, 200


class NormalizeTests(SimpleTestCase):
    def test_spaces_and_case_are_cleaned_up(self):
        self.assertEqual(normalize_tracking_number(" 3s abc 1234 567 "), NUMBER)

    def test_a_pasted_postnl_link_gives_the_code(self):
        link = "https://jouw.postnl.nl/track-and-trace/3SABC1234567-NL-1234AB"
        self.assertEqual(normalize_tracking_number(link), NUMBER)

    def test_nonsense_is_refused(self):
        for value in ("", "   ", "123", "<script>", "x" * 100):
            with self.subTest(value=value), self.assertRaises(InvalidTrackingNumber):
                normalize_tracking_number(value)


class StatusMappingTests(SimpleTestCase):
    def test_sub_status_is_more_precise_than_status(self):
        self.assertEqual(from_seventeen_track("InTransit", "InTransit_CustomsProcessing"), TrackingStatus.CUSTOMS)
        self.assertEqual(from_seventeen_track("Exception", "Exception_Returned"), TrackingStatus.RETURNED)

    def test_main_status_when_the_sub_status_is_unknown(self):
        self.assertEqual(from_seventeen_track("Delivered", "Delivered_Other"), TrackingStatus.DELIVERED)
        self.assertEqual(from_seventeen_track("Nonsense"), "")


class TrackingTestCase(ThrottleFreeAPITestCase):
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
        self.manager = User.objects.create_user(
            username="baas", email="baas@example.com", password="a-long-enough-password",
            role=User.Role.MANAGER,
        )
        self.booking = Booking.objects.create(**payload(), user=self.customer)
        self.order = BookingOrder.objects.create(booking=self.booking, shop_name="bol.com", description="Laptop")
        self.postnl = Carrier.objects.get(code="postnl")

    def set_tracking(self, user, code=NUMBER, carrier="postnl", order=None):
        order = order or self.order
        self.client.force_authenticate(user)
        return self.client.patch(
            reverse("my-order-tracking", args=[order.booking_id, order.pk]),
            {"tracking_code": code, "carrier": carrier},
            format="json",
        )

    def make_shipment(self, **fields):
        return CarrierShipment.objects.create(
            order=self.order, owner=self.customer, carrier=self.postnl, tracking_number=NUMBER, **fields
        )


@override_settings(SEVENTEEN_TRACK_API_KEY="")
class CustomerSavesACourierTests(TrackingTestCase):
    def test_saving_a_courier_and_number_starts_tracking(self):
        response = self.set_tracking(self.customer, code=" 3s abc 1234 567 ")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        shipment = CarrierShipment.objects.get()
        self.assertEqual(shipment.tracking_number, NUMBER)
        self.assertEqual(shipment.carrier, self.postnl)
        tracking = response.data["carrier_tracking"]
        self.assertEqual(tracking["carrier"]["name"], "PostNL")
        # No API key in this test: nothing automatic, staff update by hand.
        self.assertFalse(tracking["automatic"])

    def test_an_invalid_number_is_refused(self):
        response = self.set_tracking(self.customer, code="12")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CarrierShipment.objects.exists())

    def test_an_unknown_courier_is_refused(self):
        response = self.set_tracking(self.customer, carrier="pigeon")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_nobody_else_can_set_it(self):
        response = self.set_tracking(self.stranger)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(CarrierShipment.objects.exists())

    def test_clearing_the_number_stops_following_it(self):
        self.set_tracking(self.customer)
        self.set_tracking(self.customer, code="", carrier="")
        self.assertFalse(CarrierShipment.objects.exists())

    def test_without_a_courier_the_code_is_only_kept_as_text(self):
        """As before this feature: a link or code the office can read."""
        response = self.set_tracking(self.customer, carrier="")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["tracking_code"], NUMBER)
        self.assertIsNone(response.data["carrier_tracking"])

    def test_the_courier_list(self):
        self.client.force_authenticate(self.customer)
        names = [row["name"] for row in self.client.get(reverse("tracking-carriers")).data]
        # The trimmed list (migration 0006) plus "Other" last (0008), in
        # this order; the rest are switched off, not deleted.
        self.assertEqual(names, ["PostNL", "DHL", "DPD", "Amazon", "FedEx", "Other"])

    def test_the_customer_sees_no_staff_details(self):
        shipment = self.make_shipment()
        TrackingEvent.objects.create(
            shipment=shipment, status=TrackingStatus.IN_TRANSIT, source=TrackingEvent.Source.STAFF,
            created_by=self.office, occurred_at=timezone.now(),
        )
        wrong = TrackingEvent.objects.create(
            shipment=shipment, status=TrackingStatus.DELIVERED, source=TrackingEvent.Source.STAFF,
            occurred_at=timezone.now(),
        )
        wrong.void(self.office, "Typo")

        self.client.force_authenticate(self.customer)
        body = json.dumps(self.client.get(reverse("my-bookings")).data)

        self.assertNotIn("kantoor", body)
        self.assertNotIn("Typo", body)
        self.assertNotIn("last_sync_error", body)
        self.assertNotIn(str(wrong.pk) + ', "status": "delivered"', body)


@override_settings(SEVENTEEN_TRACK_API_KEY=KEY)
class SyncTests(TrackingTestCase):
    def fake_17track(self, accepted_track=None, register_rejected=()):
        """Patch the HTTP call: register accepts, gettrackinfo returns `accepted_track`."""
        track = accepted_track or track_object()

        def post(self_, endpoint, body):
            if endpoint == "register":
                if register_rejected:
                    return answer(endpoint, rejected=register_rejected)
                return answer(endpoint, accepted=[{"number": item["number"], "carrier": 14041} for item in body])
            return answer(endpoint, accepted=[track])

        return patch("tracking.providers.SeventeenTrack._post", post)

    def test_saving_a_number_registers_and_fetches_it(self):
        with self.fake_17track():
            response = self.set_tracking(self.customer)

        tracking = response.data["carrier_tracking"]
        self.assertTrue(tracking["automatic"])
        self.assertEqual(tracking["status"], TrackingStatus.IN_TRANSIT)
        self.assertEqual(tracking["last_location"], "Nieuwegein")
        self.assertEqual(tracking["estimated_delivery"], "2026-10-22")
        self.assertEqual(len(tracking["events"]), 2)
        self.assertTrue(all(event["verified"] for event in tracking["events"]))
        # Newest first.
        self.assertEqual(tracking["events"][0]["description"], "Parcel sorted")

    def test_fetching_twice_adds_nothing_twice(self):
        with self.fake_17track():
            self.set_tracking(self.customer)
            CarrierShipment.objects.update(next_sync_at=timezone.now())
            sync_due()
        self.assertEqual(TrackingEvent.objects.count(), 2)

    def test_a_number_the_service_rejects_is_kept_for_staff(self):
        with self.fake_17track(register_rejected=[{"number": NUMBER, "error": {"code": -1, "message": "Invalid"}}]):
            self.set_tracking(self.customer)
        shipment = CarrierShipment.objects.get()
        self.assertIsNone(shipment.registered_at)
        self.assertIsNone(shipment.next_sync_at)
        self.assertEqual(shipment.last_sync_error, "Invalid")

    def test_delivered_notifies_the_customer_and_stops_polling(self):
        delivered = track_object(status="Delivered", sub_status="Delivered_Other")
        with self.fake_17track(delivered):
            self.set_tracking(self.customer)

        shipment = CarrierShipment.objects.get()
        self.assertEqual(shipment.status, TrackingStatus.DELIVERED)
        self.assertIsNone(shipment.next_sync_at)
        notification = Notification.objects.get(user=self.customer)
        self.assertEqual(notification.context["status"], "courier_delivered")

    def test_a_temporary_failure_waits_longer_each_time(self):
        shipment = self.make_shipment(provider="17track", next_sync_at=timezone.now())
        failing = patch(
            "tracking.providers.SeventeenTrack._post", side_effect=TemporaryProviderError("timeout")
        )
        with failing:
            sync_due()
            shipment.refresh_from_db()
            first_wait = shipment.next_sync_at - timezone.now()
            CarrierShipment.objects.update(next_sync_at=timezone.now())
            sync_due()
            shipment.refresh_from_db()
            second_wait = shipment.next_sync_at - timezone.now()

        self.assertEqual(shipment.sync_failures, 2)
        self.assertGreater(second_wait, first_wait)
        self.assertFalse(TrackingSyncLog.objects.filter(ok=True).exists())

    def test_a_refused_key_fails_the_command_loudly(self):
        self.make_shipment(provider="17track", next_sync_at=timezone.now())
        with patch("tracking.providers.SeventeenTrack._post", side_effect=CredentialsError("bad key", 401)):
            with self.assertRaises(CommandError):
                call_command("sync_carrier_tracking", stdout=StringIO())

    def test_nothing_due_means_no_requests(self):
        self.make_shipment(provider="17track", next_sync_at=timezone.now() + timedelta(hours=3))
        with patch("tracking.providers.SeventeenTrack._post") as post:
            sync_due()
        post.assert_not_called()

    def test_the_warehouse_receiving_closes_the_courier_leg(self):
        from accounts.models import Package
        from accounts.warehouse import move_warehouse_stage

        shipment = self.make_shipment(status=TrackingStatus.DELIVERED)
        package = Package.objects.create(user=self.customer, tracking_number="PLSM-00042")
        self.booking.package = package
        self.booking.save(update_fields=["package"])

        move_warehouse_stage(package, Package.WarehouseStage.RECEIVED, actor=self.manager)

        shipment.refresh_from_db()
        self.assertEqual(shipment.status, TrackingStatus.RECEIVED_AT_WAREHOUSE)
        self.assertEqual(shipment.events.get().source, TrackingEvent.Source.SYSTEM)


@override_settings(SEVENTEEN_TRACK_API_KEY=KEY)
class WebhookTests(TrackingTestCase):
    url = reverse("tracking-webhook-17track")

    def push(self, body, sign=None):
        raw = json.dumps(body).encode()
        if sign is None:
            sign = hashlib.sha256(raw + b"/" + KEY.encode()).hexdigest()
        self.client.force_authenticate(None)
        return self.client.generic("POST", self.url, raw, content_type="application/json", HTTP_SIGN=sign)

    def test_the_signature_rule(self):
        raw = b'{"event":"TRACKING_UPDATED"}'
        good = hashlib.sha256(raw + b"/" + KEY.encode()).hexdigest()
        self.assertTrue(valid_seventeen_track_signature(raw, good, KEY))
        self.assertFalse(valid_seventeen_track_signature(raw + b" ", good, KEY))
        self.assertFalse(valid_seventeen_track_signature(raw, good, ""))

    def test_a_signed_push_updates_the_shipment(self):
        self.make_shipment(provider="17track", registered_at=timezone.now())
        response = self.push({"event": "TRACKING_UPDATED", "data": track_object()})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(TrackingEvent.objects.filter(source=TrackingEvent.Source.WEBHOOK).count(), 2)

        # 17TRACK retries; the same push again changes nothing.
        self.push({"event": "TRACKING_UPDATED", "data": track_object()})
        self.assertEqual(TrackingEvent.objects.count(), 2)

    def test_a_wrong_signature_is_refused_and_changes_nothing(self):
        self.make_shipment(provider="17track", registered_at=timezone.now())
        response = self.push({"event": "TRACKING_UPDATED", "data": track_object()}, sign="0" * 64)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(TrackingEvent.objects.exists())

    def test_an_unknown_number_is_acknowledged(self):
        response = self.push({"event": "TRACKING_UPDATED", "data": track_object(number="NOPE123456")})
        self.assertEqual(response.status_code, status.HTTP_200_OK)


@override_settings(SEVENTEEN_TRACK_API_KEY="")
class StaffTests(TrackingTestCase):
    def setUp(self):
        super().setUp()
        self.shipment = self.make_shipment()
        self.list_url = reverse("staff-carrier-shipment-list")
        self.events_url = reverse("staff-carrier-shipment-add-event", args=[self.shipment.pk])

    def test_customers_cannot_open_it(self):
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_search_by_number_customer_or_shop(self):
        self.client.force_authenticate(self.office)
        for term in ("3sabc", "klant@example", "bol.com"):
            with self.subTest(term=term):
                rows = self.client.get(self.list_url, {"search": term}).data["results"]
                self.assertEqual([row["id"] for row in rows], [self.shipment.pk])

    def test_staff_add_a_line_marked_as_ours(self):
        self.client.force_authenticate(self.office)
        response = self.client.post(
            self.events_url, {"status": "delayed", "description": "Storm", "location": "Utrecht"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        event = self.shipment.events.get()
        self.assertEqual(event.source, TrackingEvent.Source.STAFF)
        self.assertEqual(event.created_by, self.office)
        self.assertFalse(response.data["events"][0]["verified"])

    def test_delivered_needs_a_confirmation(self):
        self.client.force_authenticate(self.office)
        refused = self.client.post(self.events_url, {"status": "delivered"}, format="json")
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)

        accepted = self.client.post(
            self.events_url, {"status": "delivered", "confirmation": "PostNL proof of delivery"}, format="json"
        )
        self.assertEqual(accepted.status_code, status.HTTP_201_CREATED)
        self.assertIn("PostNL proof of delivery", self.shipment.events.get().description)

    def test_a_correction_keeps_the_wrong_line_on_record(self):
        self.client.force_authenticate(self.office)
        self.client.post(self.events_url, {"status": "in_transit"}, format="json")
        self.client.post(self.events_url, {"status": "returned"}, format="json")
        wrong = self.shipment.events.get(status="returned")

        response = self.client.post(
            reverse("staff-carrier-shipment-void-event", args=[self.shipment.pk, wrong.pk]),
            {"reason": "Wrong parcel"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "in_transit")
        wrong.refresh_from_db()
        self.assertEqual(wrong.voided_by, self.office)
        self.assertEqual(TrackingEvent.objects.count(), 2)

    def test_the_warehouse_manager_can_add_lines_but_not_correct_them(self):
        self.client.force_authenticate(self.manager)
        added = self.client.post(self.events_url, {"status": "in_transit"}, format="json")
        self.assertEqual(added.status_code, status.HTTP_201_CREATED)

        event = self.shipment.events.get()
        voided = self.client.post(
            reverse("staff-carrier-shipment-void-event", args=[self.shipment.pk, event.pk]),
            {"reason": "x"},
            format="json",
        )
        self.assertEqual(voided.status_code, status.HTTP_403_FORBIDDEN)

    def test_check_now_is_refused_without_automatic_tracking(self):
        self.client.force_authenticate(self.office)
        response = self.client.post(reverse("staff-carrier-shipment-refresh", args=[self.shipment.pk]))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class TrackPageTests(TrackingTestCase):
    """The profile's "track a number" box also finds the courier's number."""

    def test_the_owner_finds_their_courier_number(self):
        self.make_shipment()
        self.client.force_authenticate(self.customer)
        response = self.client.get(reverse("track", args=["3sabc1234567"]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kind"], "courier")

    def test_our_number_also_gives_the_orders_and_their_couriers(self):
        """The profile's Track & Trace box shows the whole order, not only the status."""
        from accounts.models import Package

        self.make_shipment()
        package = Package.objects.create(user=self.customer, tracking_number="PLSM-00042")
        self.booking.package = package
        self.booking.save(update_fields=["package"])

        self.client.force_authenticate(self.customer)
        data = self.client.get(reverse("track", args=["plsm-00042"])).data

        self.assertEqual(data["kind"], "shipment")
        self.assertEqual(data["orders"][0]["shop_name"], "bol.com")
        self.assertEqual(data["orders"][0]["carrier_tracking"]["tracking_number"], NUMBER)
        # Typing the courier's number shows which order and shipment it is.
        courier = self.client.get(reverse("track", args=[NUMBER])).data
        self.assertEqual(courier["order_description"], "Laptop")
        self.assertEqual(courier["package_tracking_number"], "PLSM-00042")

    def test_somebody_else_gets_the_same_404_as_for_nothing(self):
        self.make_shipment()
        self.client.force_authenticate(self.stranger)
        response = self.client.get(reverse("track", args=[NUMBER]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class WarehouseCourierScanTests(TrackingTestCase):
    """The floor scans the courier's barcode on an arriving parcel."""

    scan_url = "/api/staff/intake/scan/"
    arrival_url = "/api/staff/intake/courier-arrival/"

    def setUp(self):
        super().setUp()
        self.shipment = self.make_shipment()
        self.client.force_authenticate(self.office)

    def test_the_courier_barcode_finds_the_customers_booking(self):
        data = self.client.get(self.scan_url, {"code": "3sabc 1234567"}).data

        self.assertEqual(data["match"], "booking")
        self.assertEqual(data["courier"]["customer"], "Klaas Klant")
        self.assertEqual(data["courier"]["shop_name"], "bol.com")
        self.assertFalse(data["courier"]["arrived"])
        # Whose parcel, not how to reach them.
        self.assertNotIn("klant@example.com", json.dumps(data["courier"], default=str))

    def test_with_a_shipment_it_opens_the_shipment(self):
        from accounts.models import Package

        package = Package.objects.create(user=self.customer, tracking_number="PLSM-00042")
        self.booking.package = package
        self.booking.save(update_fields=["package"])

        data = self.client.get(self.scan_url, {"code": NUMBER}).data
        self.assertEqual(data["match"], "package")
        self.assertEqual(data["courier"]["package_tracking_number"], "PLSM-00042")

    def test_arrival_is_recorded_once(self):
        first = self.client.post(self.arrival_url, {"code": NUMBER}, format="json")
        second = self.client.post(self.arrival_url, {"code": NUMBER}, format="json")

        self.assertFalse(first.data["already"])
        self.assertTrue(second.data["already"])
        self.assertEqual(second.data["courier"]["arrived_by"], str(self.office))
        self.assertEqual(self.shipment.events.filter(status=TrackingStatus.RECEIVED_AT_WAREHOUSE).count(), 1)
        self.shipment.refresh_from_db()
        self.assertEqual(self.shipment.status, TrackingStatus.RECEIVED_AT_WAREHOUSE)

    def test_part_of_a_number_matches_nothing(self):
        data = self.client.get(self.scan_url, {"code": "3SABC1234"}).data
        self.assertEqual(data["match"], "none")
        self.assertIsNone(data["courier"])
        response = self.client.post(self.arrival_url, {"code": "3SABC1234"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_the_same_number_on_two_orders_is_left_to_a_person(self):
        other = BookingOrder.objects.create(
            booking=Booking.objects.create(**payload(), user=self.stranger), shop_name="IKEA", description="Kast"
        )
        CarrierShipment.objects.create(order=other, owner=self.stranger, carrier=self.postnl, tracking_number=NUMBER)

        data = self.client.get(self.scan_url, {"code": NUMBER}).data
        self.assertIsNone(data["courier"])

    def test_customers_cannot_confirm_arrivals(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(self.arrival_url, {"code": NUMBER}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class CourierLinkTests(TrackingTestCase):
    def test_a_courier_with_its_own_page(self):
        ups = Carrier.objects.get(code="ups")
        self.assertEqual(ups.tracking_url("1Z 999"), "https://www.ups.com/track?tracknum=1Z%20999")

    def test_whatever_was_typed_cannot_change_where_the_link_goes(self):
        ups = Carrier.objects.get(code="ups")
        self.assertNotIn("evil.example", ups.tracking_url("x&next=//evil.example").split("tracknum=")[0])
        self.assertIn("%2F%2Fevil.example", ups.tracking_url("x&next=//evil.example"))

    def test_postnl_and_others_use_the_page_that_knows_every_courier(self):
        self.assertTrue(self.postnl.tracking_url(NUMBER).startswith("https://t.17track.net/"))

    def test_walk_in_has_no_link(self):
        self.assertIsNone(Carrier.objects.get(code="walk-in").tracking_url(NUMBER))

    def test_the_customer_gets_the_link(self):
        shipment = CarrierShipment.objects.create(
            order=self.order, owner=self.customer, carrier=Carrier.objects.get(code="dpd-nl"), tracking_number=NUMBER
        )
        self.client.force_authenticate(self.customer)
        data = self.client.get(reverse("track", args=[shipment.tracking_number])).data
        self.assertEqual(data["tracking_url"], f"https://tracking.dpd.de/status/nl_NL/parcel/{NUMBER}")
