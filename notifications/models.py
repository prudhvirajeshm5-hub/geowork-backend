"""
Module 9 - Notifications.

A `Notification` row is created for every trigger the spec lists (shift
start/end, geofence enter/exit, GPS disabled, internet disconnected,
absent, late arrival) regardless of whether a push actually reaches a
device — the in-app notification list (`GET /api/v1/notifications/`) is
always complete even if FCM delivery fails or no device is registered.
Actual push delivery is a thin, swappable layer — see `services.py`.
"""
from django.conf import settings
from django.db import models

from companies.models import Company


class NotificationType(models.TextChoices):
    SHIFT_START = "SHIFT_START", "Shift Started"
    SHIFT_END = "SHIFT_END", "Shift Ended"
    GEOFENCE_ENTER = "GEOFENCE_ENTER", "Entered Work Area"
    GEOFENCE_EXIT = "GEOFENCE_EXIT", "Exited Work Area"
    GPS_DISABLED = "GPS_DISABLED", "GPS Disabled"
    INTERNET_DISCONNECTED = "INTERNET_DISCONNECTED", "Internet Disconnected"
    ABSENT = "ABSENT", "Marked Absent"
    LATE_ARRIVAL = "LATE_ARRIVAL", "Late Arrival"
    TRANSFER_REQUESTED = "TRANSFER_REQUESTED", "Transfer Requested"
    TRANSFER_APPROVED = "TRANSFER_APPROVED", "Transfer Approved"
    TRANSFER_REJECTED = "TRANSFER_REJECTED", "Transfer Rejected"
    OUTDOOR_DUTY_REQUESTED = "OUTDOOR_DUTY_REQUESTED", "Outdoor Duty Requested"
    OUTDOOR_DUTY_APPROVED = "OUTDOOR_DUTY_APPROVED", "Outdoor Duty Approved"
    OUTDOOR_DUTY_REJECTED = "OUTDOOR_DUTY_REJECTED", "Outdoor Duty Rejected"


class DeliveryStatus(models.TextChoices):
    SENT = "SENT", "Sent to at least one device"
    NO_DEVICE = "NO_DEVICE", "No active device registered"
    FAILED = "FAILED", "Delivery failed"


class Notification(models.Model):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="notifications")

    notification_type = models.CharField(max_length=25, choices=NotificationType.choices)
    title = models.CharField(max_length=150)
    body = models.TextField()
    # Free-form deep-link payload, e.g. {"attendance_record_id": 42} or
    # {"employee_id": 7, "work_area_id": 3} — lets the mobile app route a
    # tapped notification straight to the relevant screen.
    data = models.JSONField(default=dict, blank=True)

    delivery_status = models.CharField(max_length=15, choices=DeliveryStatus.choices, default=DeliveryStatus.NO_DEVICE)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["recipient", "-created_at"]),
            models.Index(fields=["recipient", "is_read"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.notification_type} -> {self.recipient} ({self.created_at:%Y-%m-%d %H:%M})"