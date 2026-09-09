import random
import string
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

from .managers import UserManager

phone_validator = RegexValidator(
    regex=r"^\+?[1-9]\d{7,14}$",
    message="Enter a valid phone number including country code, e.g. +919876543210",
)


class Role(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    MANAGER = "MANAGER", "Manager"
    EMPLOYEE = "EMPLOYEE", "Employee"


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom auth user. A user without a `company` is a platform-level admin;
    otherwise the user belongs to exactly one company (multi-tenant scoping).
    """

    phone = models.CharField(max_length=20, unique=True, validators=[phone_validator])
    email = models.EmailField(unique=True, null=True, blank=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.EMPLOYEE)
    company = models.ForeignKey(
        "companies.Company", on_delete=models.CASCADE, null=True, blank=True, related_name="users"
    )

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_phone_verified = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    # Set when an admin issues a temporary password (V1.1 Admin Password
    # Reset, Option B). Forces a password change on next login before any
    # other endpoint is usable — see accounts.permissions.MustChangePassword.
    must_change_password = models.BooleanField(default=False)
    password_changed_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = []

    class Meta:
        indexes = [
            models.Index(fields=["company", "role"]),
        ]

    def __str__(self):
        return f"{self.get_full_name()} ({self.phone})"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.phone

    def get_short_name(self):
        return self.first_name or self.phone


def generate_otp_code(length=None):
    length = length or getattr(settings, "OTP_LENGTH", 6)
    return "".join(random.choices(string.digits, k=length))


class OTP(models.Model):
    class Purpose(models.TextChoices):
        LOGIN = "LOGIN", "Login"
        RESET_PASSWORD = "RESET_PASSWORD", "Reset Password"
        VERIFY_PHONE = "VERIFY_PHONE", "Verify Phone"

    phone = models.CharField(max_length=20, db_index=True)
    code = models.CharField(max_length=8)
    purpose = models.CharField(max_length=20, choices=Purpose.choices, default=Purpose.LOGIN)
    is_used = models.BooleanField(default=False)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        indexes = [models.Index(fields=["phone", "purpose", "is_used"])]

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = generate_otp_code()
        if not self.expires_at:
            minutes = getattr(settings, "OTP_EXPIRY_MINUTES", 5)
            self.expires_at = timezone.now() + timedelta(minutes=minutes)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return f"OTP({self.phone}, {self.purpose})"


class Device(models.Model):
    """Registered mobile device, used for push notifications and session control."""

    class Platform(models.TextChoices):
        ANDROID = "ANDROID", "Android"
        IOS = "IOS", "iOS"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="devices")
    device_id = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=10, choices=Platform.choices)
    fcm_token = models.CharField(max_length=255, blank=True)
    app_version = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    registered_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["user", "is_active"])]

    def __str__(self):
        return f"{self.user.phone} - {self.device_id} ({self.platform})"


class AuditLog(models.Model):
    """
    Platform-wide security audit trail (V1.1 requirement #16), shared across
    apps so "who did what security-sensitive thing, when" lives in one place
    instead of being scattered/duplicated per-module. Modules that already
    have their own domain-specific audit log (e.g. geofence.WorkAreaAuditLog)
    keep that one for domain detail and ALSO write a summary row here so a
    single query answers "show me all security events for this company".
    """

    class Action(models.TextChoices):
        PASSWORD_CHANGED = "PASSWORD_CHANGED", "Password changed (self-service)"
        PASSWORD_RESET_REQUESTED = "PASSWORD_RESET_REQUESTED", "Password reset requested"
        PASSWORD_RESET_COMPLETED = "PASSWORD_RESET_COMPLETED", "Password reset completed"
        ADMIN_PASSWORD_RESET_INITIATED = "ADMIN_PASSWORD_RESET_INITIATED", "Admin-initiated password reset"
        ADMIN_TEMP_PASSWORD_SET = "ADMIN_TEMP_PASSWORD_SET", "Admin set a temporary password"
        LOGOUT_ALL_DEVICES = "LOGOUT_ALL_DEVICES", "Logged out from all devices"
        EMPLOYEE_DISABLED = "EMPLOYEE_DISABLED", "Employee disabled"
        EMPLOYEE_ENABLED = "EMPLOYEE_ENABLED", "Employee enabled"
        ATTENDANCE_MANUALLY_EDITED = "ATTENDANCE_MANUALLY_EDITED", "Attendance record manually edited"
        GEOFENCE_CREATED = "GEOFENCE_CREATED", "Geofence created"
        GEOFENCE_UPDATED = "GEOFENCE_UPDATED", "Geofence updated"
        GEOFENCE_DELETED = "GEOFENCE_DELETED", "Geofence deleted"

    company = models.ForeignKey(
        "companies.Company", on_delete=models.CASCADE, null=True, blank=True, related_name="audit_logs"
    )
    # The user the action was performed ON (e.g. the employee whose password
    # was reset). Null for actions with no single target (e.g. self logout).
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs_about_me"
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs_performed"
    )
    action = models.CharField(max_length=40, choices=Action.choices)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True, help_text="Previous/new values or other action-specific detail")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["company", "-created_at"]), models.Index(fields=["target_user", "-created_at"])]

    def __str__(self):
        return f"{self.action} by {self.performed_by} @ {self.created_at}"
