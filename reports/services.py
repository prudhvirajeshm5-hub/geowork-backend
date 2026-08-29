"""
Module 8 - Reports.

No models of its own — same philosophy as Module 7's Dashboard: every
report here is a query over `attendance.AttendanceRecord`, which already
carries everything these reports need (status, late/early-exit flags,
working minutes). Each function returns the same shape —
`{"title", "columns", "rows", "meta"}` — so `exporters.py` only has to know
how to render that one shape, regardless of which report produced it.
"""
import calendar

from employees.models import Employee

from attendance.models import AttendanceRecord, AttendanceStatus


def _scoped_employees(company_id, branch_id=None, employee_id=None):
    qs = Employee.objects.filter(company_id=company_id, status=Employee.Status.ACTIVE).select_related("user")
    if branch_id:
        qs = qs.filter(branch_id=branch_id)
    if employee_id:
        qs = qs.filter(id=employee_id)
    return qs


def _scoped_records(company_id, date_from, date_to, branch_id=None, employee_id=None):
    qs = AttendanceRecord.objects.filter(company_id=company_id, date__gte=date_from, date__lte=date_to)
    if branch_id:
        qs = qs.filter(branch_id=branch_id)
    if employee_id:
        qs = qs.filter(employee_id=employee_id)
    return qs.select_related("employee__user", "branch", "shift")


def _fmt_time(dt):
    from django.utils import timezone
    return timezone.localtime(dt).strftime("%H:%M") if dt else "-"


def _fmt_minutes(total_minutes):
    hours, minutes = divmod(total_minutes or 0, 60)
    return f"{hours}h {minutes}m"


def daily_attendance_report(company_id, target_date, branch_id=None, employee_id=None):
    records = _scoped_records(company_id, target_date, target_date, branch_id, employee_id).order_by(
        "employee__employee_code"
    )
    columns = ["Employee Code", "Employee Name", "Branch", "Status", "Check In", "Check Out", "Late (min)", "Working Hours"]
    rows = [
        [
            r.employee.employee_code, r.employee.user.get_full_name(), r.branch.name if r.branch else "-",
            r.status, _fmt_time(r.check_in_time), _fmt_time(r.check_out_time), r.late_by_minutes,
            _fmt_minutes(r.working_minutes),
        ]
        for r in records
    ]
    return {"title": f"Daily Attendance — {target_date}", "columns": columns, "rows": rows,
            "meta": {"date": str(target_date)}}


def monthly_attendance_report(company_id, year, month, branch_id=None, employee_id=None):
    start = f"{year:04d}-{month:02d}-01"
    last_day = calendar.monthrange(year, month)[1]
    end = f"{year:04d}-{month:02d}-{last_day:02d}"

    employees = _scoped_employees(company_id, branch_id, employee_id).order_by("employee_code")
    columns = ["Employee Code", "Employee Name", "Present", "Half Day", "Absent", "Late Count", "Total Working Hours"]
    rows = []
    for emp in employees:
        records = AttendanceRecord.objects.filter(employee=emp, date__gte=start, date__lte=end)
        present = records.filter(status=AttendanceStatus.PRESENT).count()
        half_day = records.filter(status=AttendanceStatus.HALF_DAY).count()
        absent = records.filter(status=AttendanceStatus.ABSENT).count()
        late = records.filter(is_late=True).count()
        total_minutes = sum(records.values_list("working_minutes", flat=True))
        rows.append([
            emp.employee_code, emp.user.get_full_name(), present, half_day, absent, late, _fmt_minutes(total_minutes),
        ])
    return {"title": f"Monthly Attendance — {calendar.month_name[month]} {year}", "columns": columns, "rows": rows,
            "meta": {"year": year, "month": month}}


def working_hours_report(company_id, date_from, date_to, branch_id=None, employee_id=None):
    employees = _scoped_employees(company_id, branch_id, employee_id).order_by("employee_code")
    columns = ["Employee Code", "Employee Name", "Days Worked", "Total Working Hours", "Avg Hours/Day"]
    rows = []
    for emp in employees:
        records = AttendanceRecord.objects.filter(
            employee=emp, date__gte=date_from, date__lte=date_to, check_in_time__isnull=False
        )
        days_worked = records.count()
        total_minutes = sum(records.values_list("working_minutes", flat=True))
        avg_minutes = int(total_minutes / days_worked) if days_worked else 0
        rows.append([
            emp.employee_code, emp.user.get_full_name(), days_worked, _fmt_minutes(total_minutes),
            _fmt_minutes(avg_minutes),
        ])
    return {"title": f"Working Hours — {date_from} to {date_to}", "columns": columns, "rows": rows,
            "meta": {"date_from": str(date_from), "date_to": str(date_to)}}


def late_report(company_id, date_from, date_to, branch_id=None, employee_id=None):
    records = _scoped_records(company_id, date_from, date_to, branch_id, employee_id).filter(
        is_late=True
    ).order_by("date", "employee__employee_code")
    columns = ["Employee Code", "Employee Name", "Date", "Check In", "Late By (min)"]
    rows = [
        [r.employee.employee_code, r.employee.user.get_full_name(), str(r.date), _fmt_time(r.check_in_time), r.late_by_minutes]
        for r in records
    ]
    return {"title": f"Late Arrivals — {date_from} to {date_to}", "columns": columns, "rows": rows,
            "meta": {"date_from": str(date_from), "date_to": str(date_to)}}


def overtime_report(company_id, date_from, date_to, branch_id=None, employee_id=None):
    """
    Overtime = working_minutes beyond the shift's full_day_minutes, on days
    the employee actually checked out. Records with no shift assigned use a
    480-minute (8-hour) fallback, matching the default used elsewhere
    (e.g. absentee-marking's implicit full-day assumption).
    """
    records = _scoped_records(company_id, date_from, date_to, branch_id, employee_id).filter(
        check_out_time__isnull=False
    ).order_by("date", "employee__employee_code")
    columns = ["Employee Code", "Employee Name", "Date", "Working Hours", "Overtime (min)"]
    rows = []
    for r in records:
        full_day = r.shift.full_day_minutes if r.shift else 480
        overtime_minutes = max(0, r.working_minutes - full_day)
        if overtime_minutes > 0:
            rows.append([
                r.employee.employee_code, r.employee.user.get_full_name(), str(r.date),
                _fmt_minutes(r.working_minutes), overtime_minutes,
            ])
    return {"title": f"Overtime — {date_from} to {date_to}", "columns": columns, "rows": rows,
            "meta": {"date_from": str(date_from), "date_to": str(date_to)}}


def attendance_percentage_report(company_id, date_from, date_to, branch_id=None, employee_id=None):
    from datetime import date as date_cls

    d_from = date_cls.fromisoformat(date_from) if isinstance(date_from, str) else date_from
    d_to = date_cls.fromisoformat(date_to) if isinstance(date_to, str) else date_to
    total_days = max(1, (d_to - d_from).days + 1)

    employees = _scoped_employees(company_id, branch_id, employee_id).order_by("employee_code")
    columns = ["Employee Code", "Employee Name", "Present Days", "Total Days", "Attendance %"]
    rows = []
    for emp in employees:
        present_days = AttendanceRecord.objects.filter(
            employee=emp, date__gte=date_from, date__lte=date_to,
            status__in=[AttendanceStatus.PRESENT, AttendanceStatus.HALF_DAY],
        ).count()
        percentage = round((present_days / total_days) * 100, 1)
        rows.append([emp.employee_code, emp.user.get_full_name(), present_days, total_days, f"{percentage}%"])
    return {"title": f"Attendance Percentage — {date_from} to {date_to}", "columns": columns, "rows": rows,
            "meta": {"date_from": str(date_from), "date_to": str(date_to)}}
