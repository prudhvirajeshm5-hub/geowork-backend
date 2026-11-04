from datetime import timedelta

from django.conf import settings
from django.contrib.gis.geos import Point
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from attendance import services as attendance_services
from attendance.models import AttendanceRecord
from geofence.models import WorkArea
from geofence.services import find_containing_work_area, find_containing_work_area_with_tolerance
from notifications import services as notification_services

from .models import EmployeeLiveStatus, LocationPing, ShiftLiveStatus


def _get_employee_or_403(user):
    employee = getattr(user, "employee_profile", None)
    if employee is None:
        raise PermissionDenied(
            "This account has no employee profile to track."
        )
    return employee


def current_shift_status(employee):
    record = AttendanceRecord.objects.filter(
        employee=employee,
        date=timezone.localdate(),
    ).first()

    if record is None:
        return ShiftLiveStatus.NOT_STARTED

    if record.status == "ABSENT" and record.check_in_time is None:
        return ShiftLiveStatus.ABSENT

    if record.check_in_time and record.check_out_time is None:
        return ShiftLiveStatus.WORKING

    if record.check_out_time:
        return ShiftLiveStatus.SHIFT_ENDED

    return ShiftLiveStatus.NOT_STARTED


def _debounce_seconds_for(new_work_area_id):
    """Use separate debounce periods for entry and exit."""
    if new_work_area_id is not None:
        return getattr(
            settings,
            "GEOFENCE_ENTRY_DEBOUNCE_SECONDS",
            45,
        )

    return getattr(
        settings,
        "GEOFENCE_EXIT_DEBOUNCE_SECONDS",
        180,
    )


def process_ping(
    user,
    latitude,
    longitude,
    accuracy_meters=None,
    battery_level=None,
    gps_enabled=True,
    network_connected=True,
    recorded_at=None,
    event_id=None,
):
    """Record a GPS ping and process confirmed work-area transitions."""

    employee = _get_employee_or_403(user)
    now = timezone.now()
    _enforce_shift_cap(employee, now)
    recorded_at = recorded_at or now

    if timezone.is_naive(recorded_at):
        raise ValidationError({
            "recorded_at": "A timezone-aware timestamp is required."
        })

    max_future_skew = timedelta(minutes=2)
    max_event_age = timedelta(
        minutes=getattr(
            settings,
            "LIVE_TRACKING_MAX_EVENT_AGE_MINUTES",
            10,
        )
    )

    if recorded_at > now + max_future_skew:
        raise ValidationError({
            "recorded_at": "Timestamp is too far in the future."
        })

    if accuracy_meters is not None and not 0 <= accuracy_meters <= 10000:
        raise ValidationError({
            "accuracy_meters": (
                "Accuracy must be between 0 and 10000 metres."
            )
        })

    if battery_level is not None and not 0 <= battery_level <= 100:
        raise ValidationError({
            "battery_level": "Battery level must be between 0 and 100."
        })

    point = Point(float(longitude), float(latitude), srid=4326)

    attendance_record = None
    transition = None
    previous_gps_enabled = True
    previous_network_connected = True

    with transaction.atomic():
        live_status, _ = EmployeeLiveStatus.objects.get_or_create(
            employee=employee,
            defaults={
                "company": employee.company,
                "branch": employee.branch,
            },
        )

        live_status = EmployeeLiveStatus.objects.select_for_update().get(
            pk=live_status.pk
        )

        # Idempotency: ignore a previously processed client event.
        if event_id is not None:
            existing = LocationPing.objects.filter(
                employee=employee,
                event_id=event_id,
            ).first()

            if existing:
                return live_status, None

        is_too_old = recorded_at < now - max_event_age
        is_out_of_order = (
            live_status.last_ping_at is not None
            and recorded_at < live_status.last_ping_at
        )

        new_work_area = find_containing_work_area_with_tolerance(
            employee.company_id,
            latitude,
            longitude,
            accuracy_meters=accuracy_meters,
            branch_id=employee.branch_id,
        )

        try:
            # Savepoint allows safe recovery from a duplicate event ID.
            with transaction.atomic():
                LocationPing.objects.create(
                    employee=employee,
                    company=employee.company,
                    location=point,
                    accuracy_meters=accuracy_meters,
                    battery_level=battery_level,
                    gps_enabled=gps_enabled,
                    network_connected=network_connected,
                    work_area=new_work_area,
                    recorded_at=recorded_at,
                    event_id=event_id,
                )

        except IntegrityError:
            if (
                event_id is not None
                and LocationPing.objects.filter(
                    employee=employee,
                    event_id=event_id,
                ).exists()
            ):
                return live_status, None
            raise

        # Keep delayed pings for audit, but don't let them change live state.
        if is_too_old or is_out_of_order:
            return live_status, None

        previous_gps_enabled = live_status.gps_enabled
        previous_network_connected = live_status.network_connected

        confirmed_work_area_id = live_status.current_work_area_id
        new_work_area_id = (
            new_work_area.id if new_work_area else None
        )

        # A poor GPS fix (large accuracy radius) can't be trusted to decide inside or
        # outside, so it keeps the employee's current work-area state and position.
        poor_fix = (
            accuracy_meters is not None
            and accuracy_meters > getattr(settings, "GEOFENCE_MAX_DECISION_ACCURACY_M", 50)
        )
        if poor_fix:
            new_work_area_id = confirmed_work_area_id

        if not poor_fix:
            live_status.last_location = point
        live_status.last_accuracy_meters = accuracy_meters
        live_status.last_battery_level = battery_level
        live_status.gps_enabled = gps_enabled
        live_status.network_connected = network_connected
        live_status.last_ping_at = recorded_at
        live_status.last_contact_at = now
        live_status.branch = employee.branch

        # Geofence debounce: don't change confirmed membership until
        # the candidate area has remained consistent long enough.
        if new_work_area_id == confirmed_work_area_id:
            live_status.candidate_work_area = None
            live_status.candidate_since = None

        elif (
            new_work_area_id == live_status.candidate_work_area_id
            and live_status.candidate_since is not None
        ):
            elapsed = (
                recorded_at - live_status.candidate_since
            ).total_seconds()

            if elapsed >= _debounce_seconds_for(new_work_area_id):
                if (
                    confirmed_work_area_id is not None
                    and new_work_area_id is not None
                ):
                    # OPTION A: direct area-to-area move.
                    # Keep the shift active; do not call attendance
                    # EXIT or ENTER for this transition.
                    transition = (
                        "MOVE",
                        confirmed_work_area_id,
                        new_work_area_id,
                    )

                elif confirmed_work_area_id is not None:
                    # Leaving all work areas.
                    transition = (
                        "EXIT",
                        confirmed_work_area_id,
                    )

                elif new_work_area_id is not None:
                    # Entering a work area from outside.
                    transition = (
                        "ENTER",
                        new_work_area_id,
                    )

                live_status.current_work_area = new_work_area
                live_status.candidate_work_area = None
                live_status.candidate_since = None

        else:
            live_status.candidate_work_area = new_work_area
            live_status.candidate_since = recorded_at

        live_status.save()

    # Notifications and attendance are processed after the transaction.
    if previous_gps_enabled and not gps_enabled:
        notification_services.notify_gps_disabled(employee)

    if previous_network_connected and not network_connected:
        notification_services.notify_internet_disconnected(employee)

    if transition is not None:
        event_type = transition[0]

        if event_type == "MOVE":
            previous_id, next_id = transition[1], transition[2]

            previous_work_area = WorkArea.objects.filter(
                id=previous_id
            ).first()

            next_work_area = WorkArea.objects.filter(
                id=next_id
            ).first()

            # Notify about both sides of the move without invoking
            # attendance checkout/check-in logic.
            notification_services.notify_geofence_event(
                employee,
                "EXIT",
                previous_work_area,
            )
            notification_services.notify_geofence_event(
                employee,
                "ENTER",
                next_work_area,
            )

        elif event_type == "EXIT":
            attendance_record = (
                attendance_services.process_geofence_event(
                    user,
                    "EXIT",
                    latitude,
                    longitude,
                )
            )

            previous_work_area = WorkArea.objects.filter(
                id=transition[1]
            ).first()

            notification_services.notify_geofence_event(
                employee,
                "EXIT",
                previous_work_area,
            )

        elif event_type == "ENTER":
            attendance_record = (
                attendance_services.process_geofence_event(
                    user,
                    "ENTER",
                    latitude,
                    longitude,
                )
            )

            notification_work_area = WorkArea.objects.filter(
                id=transition[1]
            ).first()

            notification_services.notify_geofence_event(
                employee,
                "ENTER",
                notification_work_area,
            )

    return live_status, attendance_record

def _enforce_shift_cap(employee, now):
    """Stop tracking once an open shift runs past LIVE_TRACKING_MAX_SHIFT_HOURS."""
    max_hours = getattr(settings, "LIVE_TRACKING_MAX_SHIFT_HOURS", 12)
    open_record = (
        AttendanceRecord.objects.filter(
            employee=employee,
            check_in_time__isnull=False,
            check_out_time__isnull=True,
        )
        .order_by("-check_in_time")
        .first()
    )
    if open_record and now - open_record.check_in_time > timedelta(hours=max_hours):
        raise PermissionDenied(
            "Your shift has exceeded the maximum tracked duration. Tracking has stopped; please check out."
        )


def record_heartbeat(user, gps_enabled=True, network_connected=True, battery_level=None):
    """Status-only update with no location. Keeps the employee online and lets
    the dashboard show GPS-disabled when the phone reports it."""
    employee = _get_employee_or_403(user)
    now = timezone.now()
    _enforce_shift_cap(employee, now)

    if current_shift_status(employee) != ShiftLiveStatus.WORKING:
        raise PermissionDenied("There is no active shift to report for.")

    with transaction.atomic():
        live_status, _ = EmployeeLiveStatus.objects.get_or_create(
            employee=employee,
            defaults={"company": employee.company, "branch": employee.branch},
        )
        live_status = EmployeeLiveStatus.objects.select_for_update().get(pk=live_status.pk)

        previous_gps_enabled = live_status.gps_enabled
        previous_network_connected = live_status.network_connected

        live_status.gps_enabled = gps_enabled
        live_status.network_connected = network_connected
        live_status.last_contact_at = now
        if battery_level is not None:
            live_status.last_battery_level = battery_level
        live_status.save()

    if previous_gps_enabled and not gps_enabled:
        notification_services.notify_gps_disabled(employee)
    if previous_network_connected and not network_connected:
        notification_services.notify_internet_disconnected(employee)

    return live_status
