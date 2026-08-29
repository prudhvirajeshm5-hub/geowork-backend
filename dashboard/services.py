"""
Module 7 - Dashboard.

Deliberately has no models of its own: every tile here is a rollup query
over data that Modules 3 (Employee), 5 (Attendance), and 6 (Tracking)
already own. That keeps this module cheap to build and impossible to drift
out of sync with the modules it's summarizing.

Two different time semantics are in play, and the response is explicit
about which is which:
  - Present / Absent / Late / Half Day are computed for a specific `date`
    (defaults to today) from AttendanceRecord — meaningful for any day.
  - Working / Outside Work Area / GPS Disabled are always a snapshot of
    *right now* from EmployeeLiveStatus — there's no historical "who was
    online at 3pm last Tuesday" data to query, only the live/last-known state.
"""
from django.utils import timezone

from attendance.models import AttendanceRecord, AttendanceStatus
from employees.models import Employee
from tracking.models import EmployeeLiveStatus

# Job Management (Create/Assign/Accept/Reject/Complete Job) is a V2.0
# feature per the roadmap and doesn't exist yet, so these two tiles are
# placeholders rather than fabricated numbers — see `jobs_module_available`.
JOBS_MODULE_AVAILABLE = False


def get_dashboard_summary(company_id, branch_id=None, target_date=None):
    target_date = target_date or timezone.localdate()

    employees = Employee.objects.filter(company_id=company_id, status=Employee.Status.ACTIVE)
    attendance = AttendanceRecord.objects.filter(company_id=company_id, date=target_date)
    live = EmployeeLiveStatus.objects.filter(company_id=company_id)
    if branch_id:
        employees = employees.filter(branch_id=branch_id)
        attendance = attendance.filter(branch_id=branch_id)
        live = live.filter(branch_id=branch_id)

    total_employees = employees.count()
    present_count = attendance.filter(status=AttendanceStatus.PRESENT).count()
    absent_count = attendance.filter(status=AttendanceStatus.ABSENT).count()
    half_day_count = attendance.filter(status=AttendanceStatus.HALF_DAY).count()
    late_count = attendance.filter(is_late=True).count()

    currently_working_ids = list(
        attendance.filter(check_in_time__isnull=False, check_out_time__isnull=True).values_list(
            "employee_id", flat=True
        )
    )
    working_count = len(currently_working_ids)

    outside_work_area_count = live.filter(
        employee_id__in=currently_working_ids, current_work_area__isnull=True
    ).count()

    gps_disabled_count = live.filter(employee_id__in=employees.values_list("id", flat=True), gps_enabled=False).count()

    return {
        "date": target_date,
        "branch": branch_id,
        "total_employees": total_employees,
        "present": present_count,
        "absent": absent_count,
        "half_day": half_day_count,
        "late": late_count,
        "working": working_count,
        "outside_work_area": outside_work_area_count,
        "gps_disabled": gps_disabled_count,
        "jobs_completed": None,
        "pending_jobs": None,
        "jobs_module_available": JOBS_MODULE_AVAILABLE,
    }
