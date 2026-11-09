"""Feedback: the button on every page, delivery reviews, the office's list."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from accounts.models import Package
from config.testing import ThrottleFreeAPITestCase
from notifications.messages import body_for
from notifications.models import Notification

from .models import Feedback

User = get_user_model()

SITE_URL = reverse("feedback")
DELIVERIES_URL = reverse("feedback-deliveries")
STAFF_URL = reverse("staff-feedback-list")


def make_user(email, **extra):
    return User.objects.create_user(username=email, email=email, password="a-long-enough-password", **extra)


class FeedbackTestCase(ThrottleFreeAPITestCase):
    def setUp(self):
        super().setUp()
        self.customer = make_user("klant@example.com", first_name="Klaas", last_name="Klant")
        self.other = make_user("ander@example.com")
        self.office = make_user("kantoor@example.com", role=User.Role.OFFICE)
        self.delivered = Package.objects.create(
            user=self.customer,
            tracking_number="PLS-1",
            status=Package.Status.DELIVERED,
            delivered_at=timezone.now(),
        )
        self.on_the_way = Package.objects.create(
            user=self.customer, tracking_number="PLS-2", status=Package.Status.IN_TRANSIT
        )


class SiteFeedbackTests(FeedbackTestCase):
    def test_a_visitor_sends_stars_a_comment_and_the_page(self):
        response = self.client.post(
            SITE_URL,
            {"rating": 4, "comment": "  Handig!  ", "page": "/booking", "email": "a@b.nl", "language": "nl"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        feedback = Feedback.objects.get()
        self.assertEqual(
            (feedback.kind, feedback.rating, feedback.comment, feedback.page, feedback.email, feedback.language),
            ("site", 4, "Handig!", "/booking", "a@b.nl", "nl"),
        )
        self.assertIsNone(feedback.user)
        # Nothing is echoed back.
        self.assertIsNone(response.data)

    def test_signed_in_it_is_linked_to_the_account(self):
        self.client.force_authenticate(self.customer)
        self.client.post(SITE_URL, {"rating": 5}, format="json")
        self.assertEqual(Feedback.objects.get().user, self.customer)

    def test_stars_must_be_1_to_5(self):
        for rating in (0, 6, "", None):
            with self.subTest(rating=rating):
                response = self.client.post(SITE_URL, {"rating": rating}, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Feedback.objects.exists())

    def test_only_a_path_on_our_site_is_kept_as_the_page(self):
        self.client.post(SITE_URL, {"rating": 3, "page": "https://evil.example/x"}, format="json")
        self.assertEqual(Feedback.objects.get().page, "")


class DeliveryReviewTests(FeedbackTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.customer)

    def test_lists_my_delivered_shipments_with_my_review(self):
        rows = self.client.get(DELIVERIES_URL).data
        self.assertEqual([row["tracking_number"] for row in rows], ["PLS-1"])
        self.assertIsNone(rows[0]["review"])

        self.client.post(DELIVERIES_URL, {"package": self.delivered.pk, "rating": 5, "comment": "Top"}, format="json")

        rows = self.client.get(DELIVERIES_URL).data
        self.assertEqual(rows[0]["review"], {"rating": 5, "comment": "Top"})

    def test_a_review_is_saved_once_per_shipment(self):
        first = self.client.post(DELIVERIES_URL, {"package": self.delivered.pk, "rating": 5}, format="json")
        second = self.client.post(DELIVERIES_URL, {"package": self.delivered.pk, "rating": 1}, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
        review = Feedback.objects.get()
        self.assertEqual(
            (review.kind, review.rating, review.package, review.user),
            ("delivery", 5, self.delivered, self.customer),
        )

    def test_not_before_it_is_delivered(self):
        response = self.client.post(DELIVERIES_URL, {"package": self.on_the_way.pk, "rating": 4}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_not_somebody_elses_shipment(self):
        self.client.force_authenticate(self.other)
        response = self.client.post(DELIVERIES_URL, {"package": self.delivered.pk, "rating": 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(DELIVERIES_URL).data, [])

    def test_signed_out_gets_nothing(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(DELIVERIES_URL).status_code, (401, 403))


class DeliveredEmailTests(FeedbackTestCase):
    def test_the_delivered_email_asks_for_a_review(self):
        notification = Notification.objects.create(
            user=self.customer,
            kind=Notification.Kind.SHIPMENT_STATUS,
            package=self.delivered,
            context={"tracking_number": "PLS-1", "status": "delivered"},
        )
        body = body_for(notification)
        self.assertIn(f"/profile?review={self.delivered.pk}#reviews", body)

    def test_other_status_emails_do_not(self):
        notification = Notification.objects.create(
            user=self.customer,
            kind=Notification.Kind.SHIPMENT_STATUS,
            package=self.on_the_way,
            context={"tracking_number": "PLS-2", "status": "in_transit"},
        )
        self.assertNotIn("review=", body_for(notification))


class StaffFeedbackTests(FeedbackTestCase):
    def setUp(self):
        super().setUp()
        Feedback.objects.create(kind="site", rating=2, comment="Slow page", page="/booking")
        Feedback.objects.create(kind="delivery", rating=5, user=self.customer, package=self.delivered)

    def test_the_office_reads_and_filters(self):
        self.client.force_authenticate(self.office)
        self.assertEqual(self.client.get(STAFF_URL).data["count"], 2)
        rows = self.client.get(STAFF_URL, {"kind": "delivery"}).data["results"]
        self.assertEqual(rows[0]["package_tracking"], "PLS-1")
        self.assertEqual(rows[0]["customer"]["name"], "Klaas Klant")
        self.assertEqual(self.client.get(STAFF_URL, {"rating": 2}).data["count"], 1)
        self.assertEqual(self.client.get(STAFF_URL, {"search": "slow"}).data["count"], 1)

    def test_marking_handled_stamps_who_and_when(self):
        self.client.force_authenticate(self.office)
        feedback = Feedback.objects.get(kind="site")
        url = reverse("staff-feedback-detail", args=[feedback.pk])

        response = self.client.patch(url, {"handled": True, "staff_note": "Fixed"}, format="json")

        self.assertEqual(response.status_code, 200)
        feedback.refresh_from_db()
        self.assertEqual(feedback.handled_by, self.office)
        self.assertIsNotNone(feedback.handled_at)
        self.assertEqual(feedback.staff_note, "Fixed")
        self.assertEqual(self.client.get(STAFF_URL, {"handled": "false"}).data["count"], 1)
        # The rating itself cannot be changed.
        self.client.patch(url, {"rating": 5, "comment": "x"}, format="json")
        feedback.refresh_from_db()
        self.assertEqual((feedback.rating, feedback.comment), (2, "Slow page"))

    def test_customers_cannot_read_it(self):
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get(STAFF_URL).status_code, status.HTTP_403_FORBIDDEN)


class OfficeEmailTests(FeedbackTestCase):
    """The office gets an e-mail for every new feedback and review."""

    def test_website_feedback_is_e_mailed_to_the_office(self):
        from django.core import mail

        with self.settings(FEEDBACK_NOTIFY_EMAILS=["info@example.com"]), self.captureOnCommitCallbacks(execute=True):
            self.client.post(
                SITE_URL,
                {"rating": 2, "comment": "Slow page", "page": "/booking", "email": "a@b.nl"},
                format="json",
            )

        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["info@example.com"])
        self.assertIn("Website feedback", message.subject)
        self.assertIn("Slow page", message.body)
        self.assertIn("/booking", message.body)
        self.assertIn("/dashboard/feedback", message.body)
        # "Reply" answers the visitor.
        self.assertEqual(message.reply_to, ["a@b.nl"])
        self.assertIsNotNone(Feedback.objects.get().office_emailed_at)

    def test_a_delivery_review_is_e_mailed_with_the_shipment(self):
        from django.core import mail

        self.client.force_authenticate(self.customer)
        with self.settings(FEEDBACK_NOTIFY_EMAILS=["info@example.com"]), self.captureOnCommitCallbacks(execute=True):
            self.client.post(
                DELIVERIES_URL, {"package": self.delivered.pk, "rating": 5, "comment": "Top"}, format="json"
            )

        message = mail.outbox[0]
        self.assertIn("Delivery review", message.subject)
        self.assertIn("PLS-1", message.subject)
        self.assertIn("Klaas Klant", message.body)
        self.assertEqual(message.reply_to, ["klant@example.com"])

    def test_never_twice(self):
        from django.core import mail

        from .tasks import send_feedback_email

        feedback = Feedback.objects.create(kind="site", rating=3)
        with self.settings(FEEDBACK_NOTIFY_EMAILS=["info@example.com"]):
            send_feedback_email(feedback.pk)
            send_feedback_email(feedback.pk)
        self.assertEqual(len(mail.outbox), 1)

    def test_nobody_set_sends_nothing(self):
        from django.core import mail

        with self.settings(FEEDBACK_NOTIFY_EMAILS=[]), self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(SITE_URL, {"rating": 4}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 0)
