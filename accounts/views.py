import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Device, OTP, User
from .serializers import (
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
        otp = OTP.objects.create(phone=phone, purpose=OTP.Purpose.RESET_PASSWORD)
        send_otp_sms(phone, otp.code, OTP.Purpose.RESET_PASSWORD)
        return Response({"detail": "Password reset OTP sent."})


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
            return Response({"detail": "No account found for this phone number."}, status=404)

        user.set_password(data["new_password"])
        user.save(update_fields=["password"])
        otp.is_used = True
        otp.save(update_fields=["is_used"])
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
