"""Serializers for the staff dashboard.

These show more than the customer-facing ones do — a quote request's message,
who owns a package — so they are only ever reachable behind IsStaff.

Each one still lists its fields explicitly and marks as read-only everything
that is a record of what happened rather than a decision staff get to make.
"""

from pathlib import Path

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import serializers

from accounts.models import Address, InvalidShipmentTransition, Package
from accounts.serializers import PackageDocumentSerializer
from enquiries.models import ContactMessage, ContactReply, QuoteReply, QuoteRequest

User = get_user_model()


class CustomerBriefSerializer(serializers.ModelSerializer):
    """Just enough about a customer to identify them in a list."""

    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "name", "email", "phone_number"]

    def get_name(self, obj):
        # str(User) already handles the anonymised case, where there is no
        # name left to show.
        return str(obj)


class StaffAddressSerializer(serializers.ModelSerializer):
    """A customer's address, as the back office sees it."""

    country_display = serializers.CharField(source="get_country_display", read_only=True)

    class Meta:
        model = Address
        fields = [
            "id",
            "label",
            "street",
            "house_number",
            "postal_code",
            "city",
            "country",
            "country_display",
            "is_default",
        ]
        read_only_fields = fields


class StaffAddressWriteSerializer(serializers.ModelSerializer):
    """The half of an address the back office may fill in for a customer.

    Separate from StaffAddressSerializer, which stays read-only because it is
    nested inside the customer row: one serializer cannot be both the shape a
    list renders and the shape a write accepts without the write silently
    becoming possible everywhere the list appears.

    The owner is never in the body -- it comes from the URL, so a staff member
    cannot file an address under a different customer by editing the payload.
    """

    class Meta:
        model = Address
        fields = [
            "id",
            "label",
            "street",
            "house_number",
            "postal_code",
            "city",
            "country",
            "is_default",
        ]
        read_only_fields = ["id"]


class _StaffPackageInvoiceMixin:
    """Kept out of the class body above only to keep its field list readable."""

    def get_invoice(self, obj):
        # hasattr on a reverse one-to-one is how Django answers "is there
        # one" without a second query, given the select_related in the view.
        invoice = getattr(obj, "invoice", None)
        if invoice is None:
            return None

        return {
            "id": invoice.pk,
            "status": invoice.status,
            "status_display": invoice.get_status_display(),
        }


class StaffCustomerSerializer(serializers.ModelSerializer):
    """A customer with their addresses and a count of their shipments.

    The same User row the customer sees on their own profile page, which is
    what makes this screen and that one two views of one record rather than
    two copies: a correction made here is what the customer reads next time
    they open their profile, and an edit they make there is what staff see on
    the next load.

    Name, e-mail and phone are therefore writable — a wrong digit in a phone
    number is found by the agent trying to arrange a handover, not by the
    customer, so the back office needs to be able to fix it. Everything else
    stays read-only: the username is what someone types to sign in, the flags
    are a record rather than a decision, and the role moves through its own
    /role/ action where the refusals live.
    """

    name = serializers.SerializerMethodField()
    addresses = StaffAddressSerializer(many=True, read_only=True)
    package_count = serializers.IntegerField(read_only=True)
    # What this customer has settled and what they are still holding a quote
    # for, both annotated by CustomerViewSet.get_queryset. Decimals rather
    # than floats all the way to the browser, which is why they arrive as
    # strings: "1120.00" survives the trip exactly, 1120.0000000001 does not.
    paid_eur = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    outstanding_eur = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    # Set when the account has been erased; the row survives only to keep the
    # shipment records intact.
    # Which of the three roles this account holds, as one word, so the table
    # shows a role rather than leaving somebody to read two checkboxes.
    role = serializers.SerializerMethodField()

    is_erased = serializers.SerializerMethodField()
    # Whether the caller may switch this row between admin and customer. The
    # server decides it -- see CustomerViewSet.role, which refuses the same
    # cases again -- so the table can grey the control out without the React
    # app having to know the rules.
    can_change_role = serializers.SerializerMethodField()
    # A warehouse worker's floor PIN: "none", "set" or "locked". Null for
    # every other role, which has no PIN to have. Never the PIN itself.
    pin_status = serializers.SerializerMethodField()
    # "on" when this person's authenticator app (two-factor sign-in) is set
    # up, "off" when not. Never the secret. See accounts/twofactor.py.
    two_factor = serializers.SerializerMethodField()
    # PLSM-C00001: what the customer writes in front of their name on a parcel.
    customer_code = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "customer_code",
            "username",
            "name",
            "first_name",
            "last_name",
            "email",
            "phone_number",
            "addresses",
            "package_count",
            "paid_eur",
            "outstanding_eur",
            "is_staff",
            "is_warehouse",
            # One word for the pair of flags above, which is what the table
            # shows and what the role dropdown is set from.
            "role",
            # Shown so the table can say why a superuser's role is fixed here:
            # that account is granted more than this screen manages.
            "is_superuser",
            "is_active",
            "is_erased",
            "can_change_role",
            "pin_status",
            "two_factor",
            "date_joined",
            "last_login",
        ]
        # Everything except the four contact fields below. The role moves
        # through the dedicated /role/ action, which is the one place its
        # refusals live, and the username is left alone because changing it
        # changes what the customer types to sign in.
        read_only_fields = [
            "id",
            "username",
            "name",
            "addresses",
            "package_count",
            "paid_eur",
            "outstanding_eur",
            "is_staff",
            "is_warehouse",
            "role",
            "is_superuser",
            "is_active",
            "is_erased",
            "can_change_role",
            "pin_status",
            "two_factor",
            "date_joined",
            "last_login",
        ]
        extra_kwargs = {
            # A customer is contacted about a shipment by one of these two, so
            # neither may be cleared from here. AbstractUser leaves the name
            # halves blank-able and the profile page allows the same, so this
            # does not tighten them beyond what the customer can do themselves.
            "email": {"required": True, "allow_blank": False},
            "phone_number": {"required": True, "allow_blank": False},
        }

    def to_internal_value(self, data):
        """Lowercase the e-mail before anything else looks at it.

        Addresses differ only by case in practice and the column is unique, so
        they are stored lowercased. Doing it here rather than in a
        `validate_email` is what makes the uniqueness check compare like with
        like: field validators run first, so "Agent@example.com" would clear a
        check against the stored "agent@example.com" and then collide on save.
        """
        if isinstance(data, dict) and isinstance(data.get("email"), str):
            data = data.copy()
            data["email"] = data["email"].lower()

        return super().to_internal_value(data)

    def get_name(self, obj):
        # str(User) already handles the erased case, where there is no name
        # left to show.
        return str(obj)

    def get_role(self, obj):
        return obj.role

    def get_is_erased(self, obj):
        return obj.anonymised_at is not None

    def get_pin_status(self, obj):
        if obj.role != User.Role.WAREHOUSE:
            return None
        pin = getattr(obj, "warehouse_pin", None)
        if pin is None:
            return "none"
        if pin.locked_at:
            return "locked"
        # Generated by a manager and not yet replaced by the worker's own.
        return "issued" if pin.must_change else "set"

    def get_two_factor(self, obj):
        device = getattr(obj, "two_factor_device", None)
        return "on" if device is not None and device.confirmed_at else "off"

    def get_can_change_role(self, obj):
        request = self.context.get("request")
        if request is None:
            return False

        return not (
            not request.user.is_admin
            or obj.pk == request.user.pk
            or obj.is_superuser
            or obj.anonymised_at is not None
        )


class StaffRoleSerializer(serializers.Serializer):
    """The body of a role change: which role the account gets.

    A named role rather than raw booleans, because that is what the screen
    offers and what the person pressing it means. User.ROLE_FLAGS maps each
    role onto is_staff and is_warehouse, in one place:

        customer    neither. No dashboard at all.
        driver      neither. No warehouse or office access.
        warehouse   is_warehouse only. Warehouse operations. Not Django's
                    /admin/, which is exactly why the floor does not get
                    is_staff.
        office      both flags. The back office without role management, and
                    the warehouse floor with it.
        admin       is_staff. The whole back office.
    """

    ADMIN = User.Role.ADMIN
    OFFICE = User.Role.OFFICE
    WAREHOUSE = User.Role.WAREHOUSE
    DRIVER = User.Role.DRIVER
    CUSTOMER = User.Role.CUSTOMER

    role = serializers.ChoiceField(choices=User.Role.values)


class StaffSignInCodeSerializer(serializers.Serializer):
    """The body of "send this warehouse worker a sign-in code": their address.

    The address, not an id, because that is what the admin has in front of
    them and what the worker signs in with. Matching is case-insensitive in
    the view, like every other place an address is looked up.
    """

    email = serializers.EmailField()


class StaffCustomerCreateSerializer(serializers.ModelSerializer):
    """A new account, opened by the office on somebody's behalf.

    The one place an account is created by a person who is not its owner. Two
    things follow from that, and they are the whole design:

    * No password field. Not a hidden one, not a generated one read out over
      the phone - none. The account is created with an unusable password and
      the owner chooses the first one from the link e-mailed to them, so the
      office never knows it and never has to be trusted not to. See
      CustomerViewSet.perform_create, which sends that e-mail.
    * The role is set here rather than through the separate /role/ action.
      That action exists to guard *changes* to an existing account - your own,
      a superuser's, an erased one - and none of those apply to an account
      that did not exist a moment ago.

    `username` is not asked for. It is the e-mail address, because that is
    what everybody types at the sign-in form anyway, and a second identifier
    invented by whoever filled this in is one more thing for the account's
    owner not to know.
    """

    role = serializers.ChoiceField(
        choices=User.Role.values,
        default=StaffRoleSerializer.CUSTOMER,
    )

    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "email",
            "phone_number",
            "role",
        ]
        extra_kwargs = {
            "first_name": {"required": True, "allow_blank": False},
            "last_name": {"required": True, "allow_blank": False},
            "email": {"required": True, "allow_blank": False},
            # Required for the same reason the customer's own signup requires
            # it: an agent at the destination arranges a handover by phone.
            "phone_number": {"required": True, "allow_blank": False},
        }

    def validate_email(self, value):
        """Lowercased, and checked for a clash in the same breath.

        The column is unique and addresses are stored lowercased, so the check
        has to happen after the fold - otherwise "Jan@example.com" passes here
        and fails on the INSERT as a 500 instead of a field error.
        """
        email = value.strip().lower()

        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError(
                "An account with this e-mail address already exists."
            )

        # The username is the address, so a collision there is the same
        # collision seen from the other side - an account created before
        # addresses were folded, say.
        if User.objects.filter(username=email).exists():
            raise serializers.ValidationError(
                "An account with this e-mail address already exists."
            )

        return email

    def create(self, validated_data):
        role = validated_data.pop("role")
        email = validated_data["email"]

        # The role alone; User.save() sets is_staff and is_warehouse from it.
        user = User.objects.create_user(username=email, role=role, **validated_data)

        # No password at all, rather than a random one nobody keeps. Nothing
        # hashes to this, so the account cannot be signed into until its owner
        # follows the link and sets one.
        user.set_unusable_password()
        user.save(update_fields=["password"])

        return user


class StaffPackageSerializer(_StaffPackageInvoiceMixin, serializers.ModelSerializer):
    """A shipment as the back office sees it: with its customer attached."""

    customer = CustomerBriefSerializer(source="user", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    # What the customer has sent in about this shipment: the receipt for what
    # they bought, the shop's invoice, a customs form. Nested rather than
    # fetched per row, or opening the packages page would cost one request per
    # shipment to find out whether there is anything to look at.
    documents = PackageDocumentSerializer(many=True, read_only=True)
    # Whether this shipment has an invoice yet, and where it stands. The
    # Packages page needs it to decide between offering to raise one and
    # pointing at the one that exists — without it the button would be a
    # guess, and pressing it on a shipment that already has an invoice would
    # look like it had done nothing.
    invoice = serializers.SerializerMethodField()
    # The dashboard greys the row out with these rather than working the rule
    # out from the status itself, so that "what may still be edited" is
    # decided once, on the model, and not re-derived in JavaScript where it
    # could drift.
    locked = serializers.BooleanField(read_only=True)
    locked_for_customer = serializers.BooleanField(read_only=True)
    lock_reason = serializers.CharField(read_only=True)
    # Where it is going, at country level. The full address is on the row as
    # delivery_address_text; this is the one line the Add invoice form needs to
    # let an admin recognise a shipment in a list of them.
    destination = serializers.CharField(source="destination_label", read_only=True)
    # What the warehouse has done, read from the same rows the floor writes -
    # a measurement saved on a tablet is on this page on the next request.
    warehouse_stage_display = serializers.CharField(
        source="get_warehouse_stage_display", read_only=True
    )
    workflow_status = serializers.CharField(read_only=True)
    workflow_status_display = serializers.CharField(
        source="get_workflow_status_display", read_only=True
    )
    measurement = serializers.SerializerMethodField()

    class Meta:
        model = Package
        fields = [
            "id",
            "tracking_number",
            "customer",
            "description",
            "status",
            "status_display",
            "warehouse_stage",
            "warehouse_stage_display",
            "warehouse_location",
            "workflow_status",
            "workflow_status_display",
            "measurement",
            "destination",
            "locked",
            "locked_for_customer",
            "lock_reason",
            "weight_kg",
            "value_eur",
            "delivery_address_text",
            # Editable: how it travels is the office's decision.
            "freight",
            # Editable: delivered by our agent, or collected by the customer.
            "handover",
            "documents",
            "invoice",
            "shipped_at",
            "delivered_at",
            # Editable here: it is a decision staff make, and the public
            # tracking page shows it.
            "estimated_arrival",
            "created_at",
            "updated_at",
        ]
        # The tracking number identifies the shipment to the carrier and the
        # customer; correcting a typo is an admin job, not a dashboard one.
        # The address snapshot is deliberately frozen (see Package.save).
        read_only_fields = [
            "id",
            "tracking_number",
            "delivery_address_text",
            "created_at",
            "updated_at",
            "documents",
            "invoice",
            "shipped_at",
            "delivered_at",
            "destination",
            "locked",
            "locked_for_customer",
            "lock_reason",
            "warehouse_stage",
            "warehouse_location",
        ]

    def get_measurement(self, obj):
        """The current warehouse measurement, or None. Uses the prefetch."""
        rows = list(obj.warehouse_measurements.all())
        if not rows:
            return None
        latest = rows[0]
        return {
            "weight_kg": str(latest.weight_kg),
            "length_cm": str(latest.length_cm),
            "width_cm": str(latest.width_cm),
            "height_cm": str(latest.height_cm),
            "volume_m3": str(latest.volume_m3),
            "dimensional_weight_kg": str(latest.dimensional_weight_kg),
            "measured_at": latest.measured_at,
            "measured_by": latest.worker.get_full_name() or latest.worker.get_username(),
        }

    def validate(self, attrs):
        """Refuse the edit here as well as in the model.

        Package.save() is the rule and would raise on its own; this runs first
        so the dashboard gets a 400 naming the offending field rather than a
        bare 409, which is the difference between a form that highlights what
        is wrong and one that just says no.
        """
        package = self.instance
        if package is None:
            return attrs

        if "status" in attrs and attrs["status"] != package.status:
            try:
                package.check_transition(attrs["status"])
            except InvalidShipmentTransition as exc:
                raise serializers.ValidationError({"status": str(exc)}) from exc

        if package.locked:
            # Whatever else the request carries, a shipment that has left is
            # not describable any differently than it already is.
            frozen = {
                field: attrs[field]
                for field in Package.FROZEN_FIELDS
                if field in attrs and attrs[field] != getattr(package, field)
            }
            if frozen:
                raise serializers.ValidationError(
                    dict.fromkeys(frozen, package.lock_reason)
                )

        return attrs


class StaffQuoteRequestSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    full_name = serializers.CharField(read_only=True)
    # The route that streams the attachment, not the file's own storage URL.
    #
    # `obj.file.url` was a MEDIA_URL path, and MEDIA_URL is served by
    # django.conf.urls.static in development and by nothing at all in
    # production — so this link worked on a developer's machine and answered
    # 404 on the deployed site. Publishing MEDIA_ROOT to fix that would have
    # been worse: these are files visitors attached to a quote request, and a
    # published media directory is one where they can be fetched by anyone who
    # guesses a name. The same reasoning as the invoice routes, arrived at
    # late for the same reason.
    file_url = serializers.SerializerMethodField()
    # The name the visitor's own file had, so the detail panel can say what
    # the document is before anybody downloads it. The stored name carries the
    # upload directory, and that is ours rather than theirs, so only the last
    # segment is published.
    file_name = serializers.SerializerMethodField()
    # The answers sent from the dashboard, oldest first (enquiries/replies.py).
    # Defined below; the views prefetch "replies__author".
    replies = serializers.SerializerMethodField()

    class Meta:
        model = QuoteRequest
        fields = [
            "id",
            "destination",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "message",
            "file_url",
            "file_name",
            "status",
            "status_display",
            "language",
            "created_at",
            "updated_at",
            "replies",
        ]
        # A submission is a record of what a visitor sent. Only the status is
        # ours to change.
        read_only_fields = [
            field for field in fields if field not in {"status"}
        ]

    def get_file_url(self, obj):
        """None when nothing was attached, so the dashboard can test it.

        A path rather than an absolute URL: behind a static host that rewrites
        /api to the API, an absolute URL names the API's own host, the browser
        declines to attach a SameSite cookie to an off-origin link, and the
        download comes back 403.
        """
        if not obj.file:
            return None
        return reverse("staff-quote-file", kwargs={"pk": obj.pk})

    def get_file_name(self, obj):
        """The attachment's own file name, or None when there is none."""
        if not obj.file:
            return None
        return Path(obj.file.name).name

    def get_replies(self, obj):
        # A method rather than a nested field, because the reply serializer
        # is defined further down this file.
        return StaffQuoteReplySerializer(obj.replies.all(), many=True).data


class StaffContactReplySerializer(serializers.ModelSerializer):
    """One answer the office sent (enquiries/replies.py). Read-only here:
    replies are made through POST /api/staff/messages/<id>/reply/."""

    author_name = serializers.SerializerMethodField()
    # True when the e-mail actually went out. Saves the page from having to
    # know that "emailed_at is not null" is what that means.
    sent = serializers.SerializerMethodField()

    class Meta:
        model = ContactReply
        fields = ["id", "body", "author_name", "created_at", "emailed_at", "sent", "send_error"]
        read_only_fields = fields

    def get_author_name(self, obj):
        if obj.author is None:
            return ""
        return obj.author.get_full_name().strip() or obj.author.email

    def get_sent(self, obj):
        return obj.emailed_at is not None


class StaffQuoteReplySerializer(StaffContactReplySerializer):
    """One answer to a quote request: the same fields as a contact reply.
    Made through POST /api/staff/quotes/<id>/reply/."""

    class Meta(StaffContactReplySerializer.Meta):
        model = QuoteReply


class StaffContactMessageSerializer(serializers.ModelSerializer):
    # Oldest first. The views prefetch "replies__author", so listing messages
    # does not cost one extra query per row.
    replies = StaffContactReplySerializer(many=True, read_only=True)

    class Meta:
        model = ContactMessage
        fields = [
            "id",
            "name",
            "email",
            "subject",
            "message",
            "handled",
            "language",
            "created_at",
            "replies",
            # Sorted by AI (enquiries/sorting.py). Blank until sorted.
            "ai_topic",
            "ai_urgency",
            "ai_summary",
            "ai_sorted_at",
        ]
        read_only_fields = [
            field for field in fields if field not in {"handled"}
        ]
