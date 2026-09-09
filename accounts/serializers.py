from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Device, OTP, Role, User


def tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    # Lets clients (mobile app) decide whether to offer Start/End Shift
    # based on whether an Employee record actually exists — not on role
    # alone. A MANAGER/ADMIN can be a field employee too (e.g. a floor
    # supervisor who also clocks in), and this is how the app tells them
    # apart from a pure back-office manager/admin with no shift of their
    # own to track.
    has_employee_profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id", "phone", "email", "first_name", "last_name", "full_name",
            "role", "company", "is_active", "is_phone_verified", "date_joined",
            "has_employee_profile", "must_change_password",
        )
        read_only_fields = (
            "id", "role", "company", "is_active", "date_joined", "is_phone_verified", "must_change_password",
        )

    def get_has_employee_profile(self, obj):
        return hasattr(obj, "employee_profile") and obj.employee_profile is not None


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ("phone", "email", "first_name", "last_name", "password", "role")

    def validate_role(self, value):
        # Self-registration can never grant ADMIN; admins are created via
        # the company onboarding flow / Django admin.
        if value == Role.ADMIN:
            raise serializers.ValidationError("Cannot self-register as admin.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class PasswordLoginSerializer(serializers.Serializer):
    phone = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(phone=attrs["phone"], password=attrs["password"])
        if not user:
            raise serializers.ValidationError("Invalid phone number or password.")
        if not user.is_active:
            raise serializers.ValidationError("This account has been disabled. Contact your administrator.")
        attrs["user"] = user
        return attrs


class OTPRequestSerializer(serializers.Serializer):
    phone = serializers.CharField()
    purpose = serializers.ChoiceField(choices=OTP.Purpose.choices, default=OTP.Purpose.LOGIN)

    def validate_phone(self, value):
        purpose = self.initial_data.get("purpose", OTP.Purpose.LOGIN)
        # RESET_PASSWORD deliberately does NOT raise here even when no
        # account exists — doing so would let an attacker enumerate valid
        # phone numbers via the forgot-password form (V1.1 security
        # requirement: "Do not expose whether a particular account exists").
        # ForgotPasswordRequestView checks existence itself, silently, and
        # always returns the same success response either way.
        if purpose == OTP.Purpose.LOGIN and not User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("No account found with this phone number.")
        return value


class OTPVerifySerializer(serializers.Serializer):
    phone = serializers.CharField()
    code = serializers.CharField()
    purpose = serializers.ChoiceField(choices=OTP.Purpose.choices, default=OTP.Purpose.LOGIN)

    def validate(self, attrs):
        from django.conf import settings

        otp = (
            OTP.objects.filter(phone=attrs["phone"], purpose=attrs["purpose"], is_used=False)
            .order_by("-created_at")
            .first()
        )
        if not otp:
            raise serializers.ValidationError("No pending OTP found. Please request a new one.")
        if otp.attempts >= getattr(settings, "OTP_MAX_ATTEMPTS", 5):
            raise serializers.ValidationError("Too many attempts. Please request a new OTP.")
        if otp.is_expired:
            raise serializers.ValidationError("This OTP has expired. Please request a new one.")
        if otp.code != attrs["code"]:
            otp.attempts += 1
            otp.save(update_fields=["attempts"])
            raise serializers.ValidationError("Incorrect OTP.")
        attrs["otp"] = otp
        return attrs


class ForgotPasswordConfirmSerializer(serializers.Serializer):
    phone = serializers.CharField()
    code = serializers.CharField()
    new_password = serializers.CharField(write_only=True, validators=[validate_password])


class ChangePasswordSerializer(serializers.Serializer):
    """Self-service change-password: requires proving the current password."""

    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs


class AdminSetTemporaryPasswordSerializer(serializers.Serializer):
    """
    Admin/manager "Option B" reset: caller never sees or sets the real
    plaintext, they only get back the ONE-TIME temporary password shown to
    them here so they can relay it to the employee out-of-band. It is never
    retrievable again after this response.
    """

    temporary_password = serializers.CharField(read_only=True)


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ("id", "device_id", "platform", "fcm_token", "app_version", "is_active", "registered_at")
        read_only_fields = ("id", "registered_at")

    def create(self, validated_data):
        user = self.context["request"].user
        device, _ = Device.objects.update_or_create(
            device_id=validated_data["device_id"],
            defaults={**validated_data, "user": user, "is_active": True, "last_seen_at": timezone.now()},
        )
        return device
