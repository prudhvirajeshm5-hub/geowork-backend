"""
Module 5 - Attendance.

One AttendanceRecord per employee per calendar day. Records are created by
either a manual Start Shift / End Shift action, or an automatic geofence
ENTER/EXIT event (Module 6 - Live Tracking - will call the same
attendance.services functions once continuous location tracking is wired
up). Either path produces the same record shape, so Reports (Module 8)
never need to know which source created a given day's attendance.
"""
from django.conf import settings
from django.db import models

from companies.models import Branch, Company, ShiftTiming
from employees.models import Employee
from geofence.models import WorkArea


class AttendanceStatus(models.TextChoices):
    PRESENT = "PRESENT", "Present"
    HALF_DAY = "HALF_DAY", "Half Day"
    ABSENT = "ABSENT", "Absent"


class AttendanceSource(models.TextChoices):
    MANUAL = "MANUAL", "Manual (Start/End Shift)"
    AUTO_GEOFENCE = "AUTO_GEOFENCE", "Automatic (Geofence Entry/Exit)"
    SYSTEM = "SYSTEM", "System (e.g. end-of-day absentee marking)"


class AttendanceRecord(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="attendance_records")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="attendance_records")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True)
    # Snapshotted at check-in time so later edits to an employee's assigned
    # shift don't retroactively change the late/half-day math on past days.
    shift = models.ForeignKey(ShiftTiming, on_delete=models.SET_NULL, null=True, blank=True)

    date = models.DateField()

    check_in_time = models.DateTimeField(null=True, blank=True)
    check_in_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_in_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_in_work_area = models.ForeignKey(
        WorkArea, on_delete=models.SET_NULL, null=True, blank=True, related_name="check_ins"
    )
    check_in_source = models.CharField(max_length=20, choices=AttendanceSource.choices, default=AttendanceSource.MANUAL)

    check_out_time = models.DateTimeField(null=True, blank=True)
    check_out_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_out_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_out_work_area = models.ForeignKey(
        WorkArea, on_delete=models.SET_NULL, null=True, blank=True, related_name="check_outs"
    )
    check_out_source = models.CharField(max_length=20, choices=AttendanceSource.choices, default=AttendanceSource.MANUAL)

    status = models.CharField(max_length=10, choices=AttendanceStatus.choices, default=AttendanceStatus.ABSENT)
    is_late = models.BooleanField(default=False)
    late_by_minutes = models.PositiveIntegerField(default=0)
    is_early_exit = models.BooleanField(default=False)
    early_exit_by_minutes = models.PositiveIntegerField(default=0)
    working_minutes = models.PositiveIntegerField(default=0)
    # Set when this day's check-in happened outside any work area because
    # the employee had an approved OutdoorDutyRequest covering this date —
    # see attendance/services.py's start_shift. Lets Reports distinguish a
    # legitimate field visit from a geofence-less check-in that shouldn't
    # have been allowed.
    is_outdoor_duty = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("employee", "date")
        indexes = [
            models.Index(fields=["company", "date", "status"]),
            models.Index(fields=["employee", "date"]),
        ]
        ordering = ["-date"]

    def __str__(self):
        return f"{self.employee.employee_code} - {self.date} ({self.status})"

    @property
    def is_checked_in(self):
        return self.check_in_time is not None and self.check_out_time is None


class OutdoorDutyRequest(models.Model):
    """
    A request for an employee to be exempt from the work-area/geofence
    requirement for a date range — client visits, field sales, off-site
    work, etc. While an APPROVED request covers today's date,
    attendance.services.start_shift allows check-in from any location
    instead of raising NotInWorkAreaError. Requires the employee's manager
    (or an admin, if no manager is assigned) to approve — see
    attendance/services.py for the request/approve/reject/cancel flow.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="outdoor_duty_requests")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="outdoor_duty_requests")

    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField(blank=True)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="outdoor_duty_requests_made"
    )
    # The manager expected to decide this request. Null means "no manager
    # assigned" — in that case any company admin may decide it.
    approver = models.ForeignKey(
        Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name="outdoor_duty_requests_to_approve"
    )

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True, related_name="outdoor_duty_requests_decided",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "status"]),
            models.Index(fields=["employee", "status", "start_date", "end_date"]),
        ]

    def __str__(self):
        return f"{self.employee.employee_code}: {self.start_date} to {self.end_date} ({self.status})"