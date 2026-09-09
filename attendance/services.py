"""
Core attendance rules, kept separate from views so both the manual
Start/End Shift endpoints and the automatic geofence-event endpoint (and,
later, Module 6's live tracking loop) share exactly one implementation of
"what does a check-in/check-out actually do".
"""
import datetime

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.models import Role
from geofence.services import find_containing_work_area
from notifications import services as notification_services

from .models import AttendanceRecord, AttendanceSource, AttendanceStatus, BreakPeriod, OutdoorDutyRequest


class NotInWorkAreaError(ValidationError):
    def __init__(self):
        super().__init__({"detail": "You must be inside an approved work area to check in."})


def _find_containing_work_area(employee, latitude, longitude):
    return find_containing_work_area(employee.company_id, latitude, longitude, branch_id=employee.branch_id)


def _get_employee_or_403(user):
    employee = getattr(user, "employee_profile", None)
    if employee is None:
        raise PermissionDenied("This account has no employee profile to record attendance against.")
    return employee


def _has_approved_outdoor_duty(employee, target_date):
    return OutdoorDutyRequest.objects.filter(
        employee=employee,
        status=OutdoorDutyRequest.Status.APPROVED,
        start_date__lte=target_date,
        end_date__gte=target_date,
    ).exists()


def get_or_create_today_record(employee):
    today = timezone.localdate()
    record, _ = AttendanceRecord.objects.get_or_create(
        employee=employee,
        date=today,
        defaults={"company": employee.company, "branch": employee.branch, "shift": employee.shift},
    )
    return record


def _late_minutes(shift, check_in_dt):
    """Minutes late relative to shift.start_time + grace_period_minutes. 0 if on time or no shift assigned."""
    if not shift:
        return 0
    local_dt = timezone.localtime(check_in_dt)
    grace_deadline = (
        datetime.datetime.combine(local_dt.date(), shift.start_time)
        + datetime.timedelta(minutes=shift.grace_period_minutes)
    )
    grace_deadline = timezone.make_aware(grace_deadline, local_dt.tzinfo) if timezone.is_naive(grace_deadline) else grace_deadline
    if local_dt <= grace_deadline:
        return 0
    return int((local_dt - grace_deadline).total_seconds() // 60)


def _early_exit_minutes(shift, check_out_dt):
    """
    Minutes early relative to shift.end_time.

    V1.1 fix: night shifts (`is_night_shift=True`, end_time on the next
    calendar day — e.g. 22:00 -> 06:00) used to be skipped entirely, which
    silently produced 0 for every early-exit/overtime calculation on those
    shifts. Fixed by anchoring `scheduled_end` to the correct calendar day:
    - Non-night shift: same day as the check-out.
    - Night shift: if the check-out's local time-of-day is still "late" in
      the sense of being >= the shift's start_time (i.e. check-out is
      happening on the day the shift *started*, before midnight), the
      scheduled end is the NEXT day. If the check-out's time-of-day is
      already past midnight but before/at end_time (i.e. the employee is
      checking out during the early-morning tail of the shift), the
      scheduled end is the SAME day.
    """
    if not shift:
        return 0
    local_dt = timezone.localtime(check_out_dt)
    check_out_date = local_dt.date()
    check_out_time = local_dt.time()

    if shift.is_night_shift:
        if check_out_time >= shift.start_time:
            # Still on the "evening" side of the shift's start (e.g. 22:00
            # start, checking out at 23:50) — the scheduled end is tomorrow.
            end_date = check_out_date + datetime.timedelta(days=1)
        else:
            # Already past midnight (e.g. 05:30) — same calendar day as the
            # scheduled end.
            end_date = check_out_date
    else:
        end_date = check_out_date

    scheduled_end = datetime.datetime.combine(end_date, shift.end_time)
    scheduled_end = timezone.make_aware(scheduled_end, local_dt.tzinfo) if timezone.is_naive(scheduled_end) else scheduled_end
    if local_dt >= scheduled_end:
        return 0
    return int((scheduled_end - local_dt).total_seconds() // 60)


def start_shift(user, latitude, longitude, source=AttendanceSource.MANUAL):
    employee = _get_employee_or_403(user)
    work_area = _find_containing_work_area(employee, latitude, longitude)
    today = timezone.localdate()
    on_outdoor_duty = work_area is None and _has_approved_outdoor_duty(employee, today)
    if work_area is None and not on_outdoor_duty:
        raise NotInWorkAreaError()

    record = get_or_create_today_record(employee)
    if record.check_in_time is not None and record.check_out_time is None:
        # Idempotent: repeated auto-geofence ENTER events while already
        # checked in should not overwrite the original check-in.
        return record

    now = timezone.now()
    record.check_in_time = now
    record.check_in_latitude = latitude
    record.check_in_longitude = longitude
    record.check_in_work_area = work_area
    record.check_in_source = source
    record.is_outdoor_duty = on_outdoor_duty
    record.shift = record.shift or employee.shift
    record.branch = record.branch or employee.branch

    late_minutes = _late_minutes(record.shift, now)
    record.is_late = late_minutes > 0
    record.late_by_minutes = late_minutes
    record.status = AttendanceStatus.PRESENT
    record.save()
    notification_services.notify_shift_start(record)
    return record


def end_shift(user, latitude, longitude, source=AttendanceSource.MANUAL):
    employee = _get_employee_or_403(user)
    record = get_or_create_today_record(employee)

    if record.check_in_time is None:
        raise ValidationError({"detail": "You have not checked in yet today."})
    if record.check_out_time is not None:
        # Idempotent for the same reason as start_shift.
        return record

    work_area = _find_containing_work_area(employee, latitude, longitude)

    now = timezone.now()
    record.check_out_time = now
    record.check_out_latitude = latitude
    record.check_out_longitude = longitude
    record.check_out_work_area = work_area
    record.check_out_source = source

    working_seconds = (record.check_out_time - record.check_in_time).total_seconds()
    record.working_minutes = max(0, int(working_seconds // 60))

    early_minutes = _early_exit_minutes(record.shift, now)
    record.is_early_exit = early_minutes > 0
    record.early_exit_by_minutes = early_minutes

    half_day_threshold = record.shift.half_day_after_minutes if record.shift else 240
    record.status = (
        AttendanceStatus.HALF_DAY if record.working_minutes < half_day_threshold else AttendanceStatus.PRESENT
    )
    record.save()
    notification_services.notify_shift_end(record)
    return record


def process_geofence_event(user, event_type, latitude, longitude):
    """
    Entry point for Module 6 (live tracking) / the mobile app's background
    geofence listener. `event_type` is "ENTER" or "EXIT". An ENTER auto
    checks-in the first time in a day; an EXIT auto checks-out — UNLESS the
    exit happens during the employee's shift's configured lunch/meal break
    window (ShiftTiming.break_start_time/break_end_time), in which case it
    opens a BreakPeriod instead and leaves the employee checked in. The
    matching re-ENTER closes that break and adds the elapsed minutes to
    the day's AttendanceRecord.total_break_minutes, rather than being
    treated as a fresh check-in. Repeated ENTER/EXIT events for the same
    day (or the same break) are safely idempotent.
    """
    employee = _get_employee_or_403(user)
    now = timezone.now()

    if event_type == "ENTER":
        record = get_or_create_today_record(employee)
        open_break = record.breaks.filter(ended_at__isnull=True).order_by("-started_at").first()
        if open_break is not None:
            _close_break(record, open_break, now)
            return record
        return start_shift(user, latitude, longitude, source=AttendanceSource.AUTO_GEOFENCE)

    if event_type == "EXIT":
        record = get_or_create_today_record(employee)
        if record.check_in_time is None:
            # Exiting a work area without ever having checked in isn't an
            # attendance event (e.g. someone just walking past the gate).
            return record
        if record.check_out_time is not None:
            # Already checked out for the day — nothing to do.
            return record
        if _is_within_break_window(record.shift or employee.shift, now):
            _start_break(record, now)
            return record
        return end_shift(user, latitude, longitude, source=AttendanceSource.AUTO_GEOFENCE)

    raise ValidationError({"event_type": "Must be 'ENTER' or 'EXIT'."})


def _is_within_break_window(shift, when):
    if shift is None or shift.break_start_time is None or shift.break_end_time is None:
        return False
    local_time = timezone.localtime(when).time()
    return shift.break_start_time <= local_time <= shift.break_end_time


def _start_break(record, now):
    # Idempotent: a repeated EXIT while already on break (e.g. GPS jitter
    # right at the geofence boundary) must not open a second concurrent
    # break for the same employee.
    if record.breaks.filter(ended_at__isnull=True).exists():
        return
    BreakPeriod.objects.create(attendance_record=record, started_at=now)


def _close_break(record, break_period, now):
    break_period.ended_at = now
    break_period.duration_minutes = max(0, int((now - break_period.started_at).total_seconds() // 60))
    break_period.save()
    record.total_break_minutes = (record.total_break_minutes or 0) + break_period.duration_minutes
    record.save(update_fields=["total_break_minutes", "updated_at"])


def _can_decide_outdoor_duty(user, request_obj):
    """The assigned approver (employee's manager) or any company admin."""
    if user.is_superuser or user.role == Role.ADMIN:
        return True
    approver = request_obj.approver
    return bool(approver and approver.user_id == user.id)


def request_outdoor_duty(requested_by, employee, start_date, end_date, reason=""):
    if end_date < start_date:
        raise ValidationError({"end_date": "Must be on or after the start date."})

    requester_employee = getattr(requested_by, "employee_profile", None)
    is_self_request = requester_employee is not None and requester_employee.id == employee.id
    if not is_self_request and not (requested_by.is_superuser or requested_by.role in (Role.ADMIN, Role.MANAGER)):
        raise PermissionDenied("Only the employee themself, their manager, or an admin can request this.")

    if employee.outdoor_duty_requests.filter(status=OutdoorDutyRequest.Status.PENDING).exists():
        raise ValidationError({"detail": "This employee already has a pending outdoor duty request."})

    request_obj = OutdoorDutyRequest.objects.create(
        employee=employee,
        company=employee.company,
        start_date=start_date,
        end_date=end_date,
        reason=reason,
        requested_by=requested_by,
        approver=employee.manager,
    )
    notification_services.notify_outdoor_duty_requested(request_obj)
    return request_obj


def approve_outdoor_duty(user, request_obj, decision_note=""):
    if not _can_decide_outdoor_duty(user, request_obj):
        raise PermissionDenied("Only the employee's manager or a company admin can approve this.")
    if request_obj.status != OutdoorDutyRequest.Status.PENDING:
        raise ValidationError({"detail": "This request has already been decided."})

    request_obj.status = OutdoorDutyRequest.Status.APPROVED
    request_obj.decided_by = user
    request_obj.decided_at = timezone.now()
    request_obj.decision_note = decision_note
    request_obj.save(update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"])

    notification_services.notify_outdoor_duty_decided(request_obj)
    return request_obj


def reject_outdoor_duty(user, request_obj, decision_note=""):
    if not _can_decide_outdoor_duty(user, request_obj):
        raise PermissionDenied("Only the employee's manager or a company admin can reject this.")
    if request_obj.status != OutdoorDutyRequest.Status.PENDING:
        raise ValidationError({"detail": "This request has already been decided."})

    request_obj.status = OutdoorDutyRequest.Status.REJECTED
    request_obj.decided_by = user
    request_obj.decided_at = timezone.now()
    request_obj.decision_note = decision_note
    request_obj.save(update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"])

    notification_services.notify_outdoor_duty_decided(request_obj)
    return request_obj


def cancel_outdoor_duty(user, request_obj):
    """The original requester, the employee themself, or an admin can withdraw a pending request."""
    is_requester = request_obj.requested_by_id == user.id
    requester_employee = getattr(user, "employee_profile", None)
    is_self = requester_employee is not None and requester_employee.id == request_obj.employee_id
    if not (is_requester or is_self or user.is_superuser or user.role == Role.ADMIN):
        raise PermissionDenied("Only the requester, the employee, or a company admin can cancel this.")
    if request_obj.status != OutdoorDutyRequest.Status.PENDING:
        raise ValidationError({"detail": "This request has already been decided."})

    request_obj.status = OutdoorDutyRequest.Status.CANCELLED
    request_obj.decided_by = user
    request_obj.decided_at = timezone.now()
    request_obj.save(update_fields=["status", "decided_by", "decided_at", "updated_at"])
    return request_obj