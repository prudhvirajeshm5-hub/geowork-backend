import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .audit import log_action
from .models import AuditLog, Device, OTP, User
from .serializers import (
    ChangePasswordSerializer,
    DeviceSerializer,
    ForgotPasswordConfirmSerializer,
    OTPRequestSerializer,
    OTPVerifySerializer,
    PasswordLoginSerializer,
    RegisterSerializer,
    UserSerializer,
    tokens_for_user,
)

logger = logging.getLogger(__name__)


class OTPThrottle(AnonRateThrottle):
    rate = "5/min"


def send_otp_sms(phone, code, purpose):
    """
    Stub for SMS gateway integration (e.g. Twilio/MSG91). Wired up separately
    per deployment; logging here keeps local/dev flows usable without a
    live provider.
    """
    logger.info("OTP %s for %s (%s)", code, phone, purpose)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {"user": UserSerializer(user).data, **tokens_for_user(user)},
            status=status.HTTP_201_CREATED,
        )


class PasswordLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.last_login_ip = request.META.get("REMOTE_ADDR")
        user.save(update_fields=["last_login_ip"])
        return Response({"user": UserSerializer(user).data, **tokens_for_user(user)})


class OTPRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [OTPThrottle]

    def post(self, request):
        serializer = OTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone"]
        purpose = serializer.validated_data["purpose"]
        otp = OTP.objects.create(phone=phone, purpose=purpose)
        send_otp_sms(phone, otp.code, purpose)
        return Response({"detail": "OTP sent successfully.", "expires_in_minutes": 5})


class OTPLoginVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [OTPThrottle]

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        otp = serializer.validated_data["otp"]
        otp.is_used = True
        otp.save(update_fields=["is_used"])

        user = User.objects.filter(phone=serializer.validated_data["phone"]).first()
        if not user:
            return Response({"detail": "No account found for this phone number."}, status=404)
        if not user.is_active:
            return Response({"detail": "This account has been disabled."}, status=403)

        user.is_phone_verified = True
        user.save(update_fields=["is_phone_verified"])
        return Response({"user": UserSerializer(user).data, **tokens_for_user(user)})


class ForgotPasswordRequestView(APIView):
    """Alias of OTPRequestView scoped to RESET_PASSWORD purpose for clearer API semantics."""

    permission_classes = [AllowAny]
    throttle_classes = [OTPThrottle]

    def post(self, request):
        data = request.data.copy()
        data["purpose"] = OTP.Purpose.RESET_PASSWORD
        serializer = OTPRequestSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone"]

        # Deliberately the SAME response whether or not this phone has an
        # account — only create/send the OTP if it does. Anything else
        # (a distinct error message, a different status code) would let an
        # attacker enumerate registered phone numbers through this form.
        user = User.objects.filter(phone=phone).first()
        if user is not None:
            otp = OTP.objects.create(phone=phone, purpose=OTP.Purpose.RESET_PASSWORD)
            send_otp_sms(phone, otp.code, OTP.Purpose.RESET_PASSWORD)
            log_action(AuditLog.Action.PASSWORD_RESET_REQUESTED, target_user=user, request=request)
        return Response({"detail": "If an account exists for this number, a reset code has been sent."})


class ForgotPasswordConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [OTPThrottle]

    def post(self, request):
        serializer = ForgotPasswordConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        otp = (
            OTP.objects.filter(
                phone=data["phone"], purpose=OTP.Purpose.RESET_PASSWORD, is_used=False
            )
            .order_by("-created_at")
            .first()
        )
        if not otp or otp.is_expired or otp.code != data["code"]:
            return Response({"detail": "Invalid or expired OTP."}, status=400)

        user = User.objects.filter(phone=data["phone"]).first()
        if not user:
            # Same generic message as an invalid/expired code — never a
            # distinct "no account" response (account-enumeration).
            return Response({"detail": "Invalid or expired OTP."}, status=400)

        user.set_password(data["new_password"])
        user.must_change_password = False
        user.password_changed_at = timezone.now()
        user.save(update_fields=["password", "must_change_password", "password_changed_at"])
        otp.is_used = True
        otp.save(update_fields=["is_used"])
        log_action(AuditLog.Action.PASSWORD_RESET_COMPLETED, target_user=user, request=request)
        return Response({"detail": "Password reset successfully."})


class LogoutView(APIView):
    """Blacklists the refresh token so the device session is fully revoked."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response({"detail": "refresh token is required."}, status=400)
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            return Response({"detail": "Invalid or already-expired token."}, status=400)
        return Response({"detail": "Logged out."})


class ChangePasswordView(APIView):
    """Profile -> Security -> Change Password. Requires the current password."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.must_change_password = False
        user.password_changed_at = timezone.now()
        user.save(update_fields=["password", "must_change_password", "password_changed_at"])
        log_action(AuditLog.Action.PASSWORD_CHANGED, performed_by=user, target_user=user, request=request)

        # The current session's tokens are still valid on purpose (spec:
        # "keep the current session active if security policy allows") —
        # only an explicit logout-all-devices call revokes other sessions.
        logout_others = bool(request.data.get("logout_other_devices"))
        if logout_others:
            _blacklist_all_outstanding_tokens(user)
            log_action(AuditLog.Action.LOGOUT_ALL_DEVICES, performed_by=user, target_user=user, request=request)

        return Response({"detail": "Password changed successfully."})


def _blacklist_all_outstanding_tokens(user):
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


class LogoutAllDevicesView(APIView):
    """
    Revokes every outstanding refresh token for the current user — the
    device making this call included, since it has no way to distinguish
    "this device" from "other devices" at the token-blacklist level. The
    client should treat a successful call here the same as a normal logout
    for itself, then require fresh credentials everywhere.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        _blacklist_all_outstanding_tokens(request.user)
        log_action(AuditLog.Action.LOGOUT_ALL_DEVICES, performed_by=request.user, target_user=request.user, request=request)
        return Response({"detail": "Logged out from all devices."})


class MeView(RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class DeviceRegistrationView(APIView):
    """Registers or refreshes a device + FCM token for push notifications."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DeviceSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        device = serializer.save()
        return Response(DeviceSerializer(device).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        device_id = request.data.get("device_id")
        Device.objects.filter(user=request.user, device_id=device_id).update(
            is_active=False, last_seen_at=timezone.now()
        )
        return Response({"detail": "Device deactivated."})
