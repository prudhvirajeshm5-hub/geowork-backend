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


def process_ping(
    user, latitude, longitude, accuracy_meters=None, battery_level=None,
    gps_enabled=True, network_connected=True, recorded_at=None,
):
    """
    Ingests one location report: records history (LocationPing), updates the
    denormalized live-dashboard row (EmployeeLiveStatus), and — this is the
    Module 5/6 handoff the Module 5 README promised — automatically fires an
    attendance ENTER/EXIT event whenever the employee's work-area membership
    changes, so attendance stays correct from continuous tracking with zero
    extra action from the mobile app beyond sending pings.
    """
    employee = _get_employee_or_403(user)
    recorded_at = recorded_at or timezone.now()

    new_work_area = find_containing_work_area(employee.company_id, latitude, longitude, branch_id=employee.branch_id)

    status, _ = EmployeeLiveStatus.objects.get_or_create(
        employee=employee, defaults={"company": employee.company, "branch": employee.branch}
    )
    previous_work_area_id = status.current_work_area_id
    previous_gps_enabled = status.gps_enabled
    previous_network_connected = status.network_connected

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

    status.last_location = Point(float(longitude), float(latitude), srid=4326)
    status.last_accuracy_meters = accuracy_meters
    status.last_battery_level = battery_level
    status.gps_enabled = gps_enabled
    status.network_connected = network_connected
    status.last_ping_at = recorded_at
    status.current_work_area = new_work_area
    status.branch = employee.branch
    status.save()

    # Notify only on a True -> False transition, never on a repeat "still
    # off" ping — otherwise a manager would get spammed every ping cycle
    # for as long as an employee's GPS/network stays off.
    if previous_gps_enabled and not gps_enabled:
        notification_services.notify_gps_disabled(employee)
    if previous_network_connected and not network_connected:
        notification_services.notify_internet_disconnected(employee)

    attendance_record = None
    new_work_area_id = new_work_area.id if new_work_area else None
    if previous_work_area_id != new_work_area_id:
        # Simple, non-overlapping-work-areas model for V1: any transition
        # away from a work area is an EXIT (checks out if still checked in);
        # any transition into one is an ENTER (checks in if not already).
        # A direct area-to-area move fires both, in that order.
        if previous_work_area_id is not None:
            attendance_record = attendance_services.process_geofence_event(user, "EXIT", latitude, longitude)
            previous_work_area = WorkArea.objects.filter(id=previous_work_area_id).first()
            notification_services.notify_geofence_event(employee, "EXIT", previous_work_area)
        if new_work_area_id is not None:
            attendance_record = attendance_services.process_geofence_event(user, "ENTER", latitude, longitude)
            notification_services.notify_geofence_event(employee, "ENTER", new_work_area)

    return status, attendance_record
