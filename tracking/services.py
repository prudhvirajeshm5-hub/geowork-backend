from django.conf import settings
from django.contrib.gis.geos import Point
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from attendance import services as attendance_services
from attendance.models import AttendanceRecord
from geofence.models import WorkArea
from geofence.services import find_containing_work_area
from notifications import services as notification_services

from .models import EmployeeLiveStatus, LocationPing, ShiftLiveStatus


def _get_employee_or_403(user):
    employee = getattr(user, "employee_profile", None)
    if employee is None:
        raise PermissionDenied("This account has no employee profile to track.")
    return employee


def current_shift_status(employee):
    record = AttendanceRecord.objects.filter(employee=employee, date=timezone.localdate()).first()
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
    """Entering a work area (ENTER) and leaving one (EXIT) get different
    debounce windows — see V1.1 requirement #7. Entering is deliberately
    faster than exiting: a false-negative ENTER just delays a check-in by
    a few seconds, while a false-positive EXIT wrongly checks someone out
    mid-shift, which is the more disruptive mistake."""
    if new_work_area_id is not None:
        return getattr(settings, "GEOFENCE_ENTRY_DEBOUNCE_SECONDS", 45)
    return getattr(settings, "GEOFENCE_EXIT_DEBOUNCE_SECONDS", 180)


def process_ping(
    user, latitude, longitude, accuracy_meters=None, battery_level=None,
    gps_enabled=True, network_connected=True, recorded_at=None,
):
    """
    Ingests one location report: records history (LocationPing), updates the
    denormalized live-dashboard row (EmployeeLiveStatus), and — this is the
    Module 5/6 handoff the Module 5 README promised — automatically fires an
    attendance ENTER/EXIT event whenever the employee's CONFIRMED work-area
    membership changes.

    V1.1: "confirmed" is new. A single ping that disagrees with the current
    confirmed work area no longer flips attendance immediately — it opens
    (or keeps open) a *candidate* state, and only gets folded into
    `current_work_area` (firing the actual attendance event) once that
    candidate has held steady for its debounce window. This absorbs GPS
    jitter right at a boundary (a reading that goes out-in-out-in within a
    few seconds no longer creates any attendance events at all) without
    changing the underlying containment rule (still boundary-inclusive,
    still one shared query with Attendance).
    """
    employee = _get_employee_or_403(user)
    recorded_at = recorded_at or timezone.now()

    new_work_area = find_containing_work_area(employee.company_id, latitude, longitude, branch_id=employee.branch_id)
    new_work_area_id = new_work_area.id if new_work_area else None

    live_status, _ = EmployeeLiveStatus.objects.get_or_create(
        employee=employee, defaults={"company": employee.company, "branch": employee.branch}
    )
    previous_gps_enabled = live_status.gps_enabled
    previous_network_connected = live_status.network_connected

    LocationPing.objects.create(
        employee=employee,
        company=employee.company,
        location=Point(float(longitude), float(latitude), srid=4326),
        accuracy_meters=accuracy_meters,
        battery_level=battery_level,
        gps_enabled=gps_enabled,
        network_connected=network_connected,
        work_area=new_work_area,
        recorded_at=recorded_at,
    )

    # Raw position/device state is always up to date every ping, regardless
    # of debounce — only the CONFIRMED work area membership is delayed.
    live_status.last_location = Point(float(longitude), float(latitude), srid=4326)
    live_status.last_accuracy_meters = accuracy_meters
    live_status.last_battery_level = battery_level
    live_status.gps_enabled = gps_enabled
    live_status.network_connected = network_connected
    live_status.last_ping_at = recorded_at
    live_status.branch = employee.branch

    confirmed_work_area_id = live_status.current_work_area_id
    attendance_record = None
    transition = None  # ("ENTER" | "EXIT", work_area_id) once/if confirmed this ping

    if new_work_area_id == confirmed_work_area_id:
        # Matches the already-confirmed state — any pending candidate was
        # just jitter, drop it.
        live_status.candidate_work_area_id = None
        live_status.candidate_since = None
    elif new_work_area_id == live_status.candidate_work_area_id and live_status.candidate_since is not None:
        # Same candidate as last time — check whether it's held long enough.
        elapsed = (recorded_at - live_status.candidate_since).total_seconds()
        if elapsed >= _debounce_seconds_for(new_work_area_id):
            if confirmed_work_area_id is not None:
                transition = ("EXIT", confirmed_work_area_id)
            if new_work_area_id is not None:
                transition = ("ENTER", new_work_area_id)
            live_status.current_work_area_id = new_work_area_id
            live_status.candidate_work_area_id = None
            live_status.candidate_since = None
        # else: still pending, nothing to confirm yet.
    else:
        # A new/different candidate — (re)start its debounce timer.
        live_status.candidate_work_area_id = new_work_area_id
        live_status.candidate_since = recorded_at

    live_status.save()

    # Notify only on a True -> False transition, never on a repeat "still
    # off" ping — otherwise a manager would get spammed every ping cycle
    # for as long as an employee's GPS/network stays off.
    if previous_gps_enabled and not gps_enabled:
        notification_services.notify_gps_disabled(employee)
    if previous_network_connected and not network_connected:
        notification_services.notify_internet_disconnected(employee)

    if transition is not None:
        event_type, work_area_id = transition
        # A direct area-to-area confirmed move fires EXIT then ENTER, same
        # ordering as before debounce existed.
        if event_type == "EXIT":
            attendance_record = attendance_services.process_geofence_event(user, "EXIT", latitude, longitude)
            previous_work_area = WorkArea.objects.filter(id=confirmed_work_area_id).first()
            notification_services.notify_geofence_event(employee, "EXIT", previous_work_area)
        if event_type == "ENTER":
            attendance_record = attendance_services.process_geofence_event(user, "ENTER", latitude, longitude)
            notification_services.notify_geofence_event(employee, "ENTER", new_work_area)

    return live_status, attendance_record
