"""Tests for the tracking and statistics endpoints.

What carries the weight: that only a shipment's own customer can follow it -
not a stranger holding its tracking number - and that what they learn is
where it is, and nothing about who is receiving it.
"""

from datetime import date

from django.urls import reverse
from rest_framework import status

from enquiries.models import QuoteRequest

from .models import Address, Package, SiteSettings
from .test_api import ApiTestCase, make_user


class TrackingTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user = make_user()
        self.address = Address.objects.create(
            user=self.user,
            street="Kaya Grandi",
            house_number="24",
            postal_code="0000",
            city="Willemstad",
            country=Address.Country.CURACAO,
            is_default=True,
        )
        self.package = Package.objects.create(
            user=self.user,
            delivery_address=self.address,
            tracking_number="PLSM-1234",
            description="Two boxes of clothing",
            status=Package.Status.IN_TRANSIT,
            estimated_arrival=date(2026, 10, 1),
        )
        # Every test below looks the shipment up as its own customer, unless
        # it says otherwise.
        self.client.force_authenticate(self.user)

    def url(self, number="PLSM-1234"):
        return reverse("track", args=[number])

    def test_the_customer_can_look_up_their_shipment(self):
        response = self.client.get(self.url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["tracking_number"], "PLSM-1234")
        self.assertEqual(response.data["status"], "in_transit")
        self.assertEqual(response.data["destination"], "Curaçao")
        self.assertEqual(response.data["progress"], 60)

    def test_a_signed_out_visitor_cannot_track_anything(self):
        """A tracking number is printed on paperwork and forwarded in e-mails.
        Holding one is not enough to follow the shipment."""
        self.client.force_authenticate(None)

        response = self.client.get(self.url())

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn("PLSM-1234", response.content.decode())

    def test_another_customers_shipment_is_not_found(self):
        """The same 404 as a number that does not exist, so the answer does
        not even confirm that it does."""
        self.client.force_authenticate(
            make_user(username="stranger", email="stranger@example.com")
        )

        response = self.client.get(self.url())

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            response.data, self.client.get(self.url("PLSM-DOES-NOT-EXIST")).data
        )

    def test_the_office_can_look_up_any_shipment(self):
        office = make_user(username="office", email="office@example.com")
        office.is_staff = True
        office.save()
        self.client.force_authenticate(office)

        response = self.client.get(self.url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["tracking_number"], "PLSM-1234")

    def test_it_reveals_nothing_about_the_recipient(self):
        """The whole reason this endpoint is written by hand rather than
        reusing PackageSerializer."""
        body = self.client.get(self.url()).content.decode()

        for secret in [
            "Jan",
            "Doe",
            "jan@example.com",
            "+599 9 123 4567",
            "Kaya Grandi",
            "Willemstad",
            "0000",
            # Not private as such, but nobody else's business either.
            "Two boxes of clothing",
        ]:
            with self.subTest(secret=secret):
                self.assertNotIn(secret, body)

        returned = set(self.client.get(self.url()).data)
        for field in ["user", "delivery_address", "delivery_address_text", "id"]:
            with self.subTest(field=field):
                self.assertNotIn(field, returned)

    def test_an_unknown_number_is_a_404(self):
        response = self.client.get(self.url("PLSM-DOES-NOT-EXIST"))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_the_number_is_matched_case_insensitively_and_trimmed(self):
        """It is typed in by hand off a label or out of an e-mail."""
        self.assertEqual(
            self.client.get(self.url("plsm-1234")).status_code, status.HTTP_200_OK
        )
        self.assertEqual(
            self.client.get(self.url("  PLSM-1234  ")).status_code, status.HTTP_200_OK
        )

    def test_the_timeline_marks_where_the_shipment_is(self):
        data = self.client.get(self.url()).data

        stages = [stage["value"] for stage in data["stages"]]
        self.assertEqual(stages.index("in_transit"), data["stage_index"])

    def test_the_warehouse_steps_show_on_the_timeline(self):
        """A paid package the warehouse has packed shows on the warehouse step.

        Received, measured and packed are one step for the customer.
        """
        Package.objects.filter(pk=self.package.pk).force_update(
            status=Package.Status.PAID,
            warehouse_stage=Package.WarehouseStage.PACKED,
        )

        data = self.client.get(self.url()).data
        stages = [stage["value"] for stage in data["stages"]]
        self.assertEqual(stages[data["stage_index"]], "received")
        # Progress only: nothing about damage, location or workers.
        for private in ("warehouse_location", "problem_note", "warehouse_stage"):
            self.assertNotIn(private, data)

    def test_the_office_status_wins_when_it_is_further_along(self):
        Package.objects.filter(pk=self.package.pk).force_update(
            warehouse_stage=Package.WarehouseStage.MEASURED
        )
        data = self.client.get(self.url()).data
        stages = [stage["value"] for stage in data["stages"]]
        self.assertEqual(stages[data["stage_index"]], "in_transit")

    def test_a_quoted_shipment_is_not_yet_on_the_timeline(self):
        # Written straight onto the row rather than saved through the model.
        # A shipment cannot travel back from in transit to quoted - see
        # Package.check_transition - and this test is about what the tracking
        # page draws for a quoted shipment, not about how it got there.
        Package.objects.filter(pk=self.package.pk).force_update(
            status=Package.Status.QUOTED
        )

        self.assertEqual(self.client.get(self.url()).data["stage_index"], -1)

    def test_a_cancelled_shipment_shows_no_progress(self):
        # As above: a shipment already in transit can no longer be cancelled,
        # and what is under test here is the display of one that was.
        Package.objects.filter(pk=self.package.pk).force_update(
            status=Package.Status.CANCELLED
        )

        data = self.client.get(self.url()).data
        self.assertEqual(data["progress"], 0)
        self.assertEqual(data["stage_index"], -1)

    def test_the_destination_survives_the_customer_being_erased(self):
        """anonymise() deletes the address rows; the frozen text is what is
        left, and its last line is the country."""
        self.user.anonymise()
        self.package.refresh_from_db()
        # An erased customer cannot sign in any more; the office still looks
        # their shipments up.
        office = make_user(username="office", email="office@example.com")
        office.is_staff = True
        office.save()
        self.client.force_authenticate(office)

        data = self.client.get(self.url()).data
        self.assertEqual(data["destination"], "Curaçao")
        self.assertNotIn("Kaya Grandi", self.client.get(self.url()).content.decode())

    def test_the_arrival_date_is_shown_when_known(self):
        self.assertEqual(
            self.client.get(self.url()).data["estimated_arrival"], "2026-10-01"
        )

    def test_the_arrival_date_is_null_rather_than_guessed(self):
        """No date is better than one arithmetic invented."""
        self.package.estimated_arrival = None
        self.package.save()

        self.assertIsNone(self.client.get(self.url()).data["estimated_arrival"])


    def test_the_last_step_says_picked_up_when_the_customer_collects_it(self):
        self.assertEqual(self.client.get(self.url()).data["stages"][-1]["value"], "delivered")

        Package.objects.filter(pk=self.package.pk).force_update(
            handover=Package.Handover.PICKUP
        )

        data = self.client.get(self.url()).data
        self.assertEqual(data["handover"], "pickup")
        self.assertEqual(data["stages"][-1], {"value": "picked_up", "label": "Picked up"})
        # Same number of steps, so the position on the timeline is unchanged.
        self.assertEqual(len(data["stages"]), 5)

    def test_the_customer_sees_five_steps(self):
        """No Paid, no Products purchased, no Packed; received, weighed and
        measured are one step."""
        data = self.client.get(self.url()).data
        self.assertEqual(
            [stage["value"] for stage in data["stages"]],
            ["received", "ready_for_shipping", "in_transit", "arrived", "delivered"],
        )

    def test_paid_is_before_the_first_step(self):
        Package.objects.filter(pk=self.package.pk).force_update(
            status=Package.Status.PAID,
            warehouse_stage=Package.WarehouseStage.AWAITING_PICKUP,
        )
        self.assertEqual(self.client.get(self.url()).data["stage_index"], -1)

    def test_received_and_measured_are_the_same_step(self):
        for stage in (Package.WarehouseStage.RECEIVED, Package.WarehouseStage.MEASURED):
            Package.objects.filter(pk=self.package.pk).force_update(
                status=Package.Status.PURCHASED, warehouse_stage=stage
            )
            data = self.client.get(self.url()).data
            self.assertEqual(data["stages"][data["stage_index"]]["value"], "received")


class SiteStatsTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        # The figures are only published while the band is switched on (it is
        # off by default); these tests are about the counting, so turn it on.
        # What a hidden band returns is tested in test_security.HiddenStatsTests.
        site = SiteSettings.load()
        site.show_stats_band = True
        site.save()
        self.user = make_user()
        self.address = Address.objects.create(
            user=self.user,
            street="Kaya Grandi",
            house_number="24",
            city="Willemstad",
            country=Address.Country.CURACAO,
            is_default=True,
        )

    def make_package(self, number, status_value, address=None):
        return Package.objects.create(
            user=self.user,
            delivery_address=address or self.address,
            tracking_number=number,
            status=status_value,
        )

    def test_counts_are_real(self):
        self.make_package("A1", Package.Status.DELIVERED)
        self.make_package("A2", Package.Status.DELIVERED)
        self.make_package("A3", Package.Status.IN_TRANSIT)

        data = self.client.get(reverse("site-stats")).data

        self.assertEqual(data["packages_delivered"], 2)
        self.assertEqual(data["packages_in_transit"], 1)
        self.assertEqual(data["packages_total"], 3)
        self.assertEqual(data["customers"], 1)

    def test_destinations_counts_islands_actually_shipped_to(self):
        """Not the length of the list of countries we would serve."""
        aruba = Address.objects.create(
            user=self.user,
            street="Caya Betico Croes",
            house_number="45",
            city="Oranjestad",
            country=Address.Country.ARUBA,
        )
        self.make_package("B1", Package.Status.DELIVERED)
        self.make_package("B2", Package.Status.DELIVERED)
        self.make_package("B3", Package.Status.DELIVERED, address=aruba)

        self.assertEqual(self.client.get(reverse("site-stats")).data["destinations"], 2)

    def test_anonymised_customers_are_not_counted(self):
        before = self.client.get(reverse("site-stats")).data["customers"]
        self.user.anonymise()
        after = self.client.get(reverse("site-stats")).data["customers"]

        self.assertEqual(after, before - 1)

    def test_quotes_handled_counts_only_answered_ones(self):
        for destination, state in [
            ("Curaçao", QuoteRequest.Status.NEW),
            ("Aruba", QuoteRequest.Status.QUOTED),
            ("Bonaire", QuoteRequest.Status.ACCEPTED),
        ]:
            QuoteRequest.objects.create(
                destination=destination,
                first_name="A",
                last_name="B",
                email="a@example.com",
                status=state,
            )

        self.assertEqual(
            self.client.get(reverse("site-stats")).data["quotes_handled"], 2
        )

    def test_hidden_until_an_admin_switches_it_on(self):
        # setUp switched the band on; start from the default, which is off.
        settings_row = SiteSettings.load()
        settings_row.show_stats_band = False
        settings_row.save()
        self.assertFalse(self.client.get(reverse("site-stats")).data["visible"])
        self.assertFalse(SiteSettings._meta.get_field("show_stats_band").default)

        settings_row = SiteSettings.load()
        settings_row.show_stats_band = True
        settings_row.save()

        self.assertTrue(self.client.get(reverse("site-stats")).data["visible"])

    def test_it_works_on_an_empty_database(self):
        """The homepage renders on day one, before anything has shipped."""
        Package.objects.all().delete()
        data = self.client.get(reverse("site-stats")).data

        self.assertEqual(data["packages_delivered"], 0)
        self.assertEqual(data["destinations"], 0)


class SiteSwitchesTests(ApiTestCase):
    def test_calculator_is_shown_by_default(self):
        self.assertTrue(self.client.get(reverse("site-switches")).data["show_calculator"])

    def test_an_admin_can_hide_the_calculator(self):
        site = SiteSettings.load()
        site.show_calculator = False
        site.save()

        self.assertFalse(self.client.get(reverse("site-switches")).data["show_calculator"])
