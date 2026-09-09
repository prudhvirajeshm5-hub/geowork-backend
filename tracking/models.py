"""
Module 6 - Live Employee Tracking.

Two models, two different jobs:
- `LocationPing` is an append-only history of every location report from
  the mobile app (audit trail, and raw material for Module 8's "distance
  travelled"/"site visits" reports in V2).
- `EmployeeLiveStatus` is one row per employee, overwritten on every ping,
  so the live dashboard (Module 7) can answer "where is everyone right now"
  with a single indexed query instead of scanning ping history.

Every ping also runs through Module 4's geofence containment check, and a
work-area transition (no-area -> area, or area -> no-area) automatically
fires Module 5's attendance check-in/check-out — see `services.py`.
"""
from django.conf import settings
from django.contrib.gis.db import models as gis_models
from django.db import models
from django.utils import timezone

from companies.models import Branch, Company
from employees.models import Employee
from geofence.models import WorkArea

# How stale a ping can be before we consider the employee OFFLINE on the
# live dashboard, regardless of what their device last reported.
ONLINE_THRESHOLD_MINUTES = getattr(settings, "LIVE_TRACKING_ONLINE_THRESHOLD_MINUTES", 5)


class ConnectivityStatus(models.TextChoices):
    ONLINE = "ONLINE", "Online"
    OFFLINE = "OFFLINE", "Offline"
    GPS_DISABLED = "GPS_DISABLED", "GPS Disabled"
    INTERNET_DISCONNECTED = "INTERNET_DISCONNECTED", "Internet Disconnected"


class ShiftLiveStatus(models.TextChoices):
    NOT_STARTED = "NOT_STARTED", "Not Started"
    WORKING = "WORKING", "Working"
    SHIFT_ENDED = "SHIFT_ENDED", "Shift Ended"
    ABSENT = "ABSENT", "Absent"


class GpsAccuracyTier(models.TextChoices):
    HIGH = "HIGH", "High accuracy"
    NORMAL = "NORMAL", "Normal accuracy"
    LOW = "LOW", "Low accuracy"


def accuracy_tier(accuracy_meters):
    """
    V1.1 requirement #8. `None` (device didn't report accuracy) is treated
    as LOW — i.e. "don't trust this reading for boundary decisions" rather
    than assuming the best case.
    """
    if accuracy_meters is None:
        return GpsAccuracyTier.LOW
    from django.conf import settings as _settings

    high = getattr(_settings, "GPS_ACCURACY_HIGH_METERS", 20)
    normal = getattr(_settings, "GPS_ACCURACY_NORMAL_METERS", 50)
    if accuracy_meters <= high:
        return GpsAccuracyTier.HIGH
    if accuracy_meters <= normal:
        return GpsAccuracyTier.NORMAL
    return GpsAccuracyTier.LOW


class LocationPing(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="location_pings")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="location_pings")

    location = gis_models.PointField(srid=4326, spatial_index=True)
    accuracy_meters = models.FloatField(null=True, blank=True)
    battery_level = models.PositiveSmallIntegerField(null=True, blank=True, help_text="0-100")
    gps_enabled = models.BooleanField(default=True)
    network_connected = models.BooleanField(default=True)

    work_area = models.ForeignKey(
        WorkArea, on_delete=models.SET_NULL, null=True, blank=True, related_name="location_pings"
    )

    # Client-reported capture time vs. when our server actually received it —
    # kept separate since mobile pings can arrive delayed/batched after a
    # period of no signal.
    recorded_at = models.DateTimeField()
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["employee", "-recorded_at"]),
            models.Index(fields=["company", "-recorded_at"]),
        ]
        ordering = ["-recorded_at"]

    def __str__(self):
        return f"{self.employee.employee_code} @ {self.recorded_at}"

    @property
    def latitude(self):
        return self.location.y

    @property
    def longitude(self):
        return self.location.x

    @property
    def accuracy_tier_value(self):
        return accuracy_tier(self.accuracy_meters)


class EmployeeLiveStatus(models.Model):
    employee = models.OneToOneField(Employee, on_delete=models.CASCADE, related_name="live_status")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="employee_live_statuses")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True)

    last_location = gis_models.PointField(srid=4326, null=True, blank=True)
    last_accuracy_meters = models.FloatField(null=True, blank=True)
    last_battery_level = models.PositiveSmallIntegerField(null=True, blank=True)
    gps_enabled = models.BooleanField(default=True)
    network_connected = models.BooleanField(default=True)
    last_ping_at = models.DateTimeField(null=True, blank=True)

    # CONFIRMED work-area membership — this is what attendance, the live
    # dashboard, and notifications all key off. Only changes once a
    # candidate has held steady for its debounce window (see
    # tracking.services.process_ping and V1.1 requirement #7).
    current_work_area = models.ForeignKey(
        WorkArea, on_delete=models.SET_NULL, null=True, blank=True, related_name="employees_currently_here"
    )

    # Debounce state: the work area (or None, for "outside everything")
    # the last several pings have suggested, if it differs from
    # `current_work_area`, and since when. Cleared once confirmed (folded
    # into current_work_area) or once a ping matches current_work_area
    # again (the candidate was just GPS jitter).
    candidate_work_area = models.ForeignKey(
        WorkArea, on_delete=models.SET_NULL, null=True, blank=True, related_name="employees_pending_here"
    )
    candidate_since = models.DateTimeField(null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Employee live statuses"
        indexes = [models.Index(fields=["company", "branch", "last_ping_at"])]
        ordering = ["-last_ping_at"]

    def __str__(self):
        return f"{self.employee.employee_code} live status"

    @property
    def is_online(self):
        if not self.last_ping_at:
            return False
        return (timezone.now() - self.last_ping_at) <= timezone.timedelta(minutes=ONLINE_THRESHOLD_MINUTES)

    @property
    def minutes_since_last_ping(self):
        """
        Raw staleness in minutes, regardless of the online/offline cutoff.
        Lets the dashboard show "Last seen 9m ago" instead of a hard
        Online/Offline binary — useful because background location on
        Android is inherently bursty (OS-level GPS/CPU throttling once the
        screen is off), so a short gap doesn't necessarily mean the
        employee actually stopped their shift.
        """
        if not self.last_ping_at:
            return None
        delta = timezone.now() - self.last_ping_at
        return max(0, int(delta.total_seconds() // 60))

    @property
    def connectivity_status(self):
        if not self.is_online:
            return ConnectivityStatus.OFFLINE
        if not self.gps_enabled:
            return ConnectivityStatus.GPS_DISABLED
        if not self.network_connected:
            return ConnectivityStatus.INTERNET_DISCONNECTED
        return ConnectivityStatus.ONLINE

    @property
    def last_accuracy_tier(self):
        """HIGH / NORMAL / LOW — lets a manager see *why* a location or a
        pending geofence transition might be uncertain (V1.1 requirement #8)."""
        return accuracy_tier(self.last_accuracy_meters)

    @property
    def last_latitude(self):
        return self.last_location.y if self.last_location else None

    @property
    def last_longitude(self):
        return self.last_location.x if self.last_location else None
