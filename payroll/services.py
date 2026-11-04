import calendar
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from attendance.models import AttendanceRecord, AttendanceSource
from .models import PayrollSettings

DEFAULT_FULL_DAY_MINUTES = 480  # same fallback the overtime report uses


def money(value):
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_settings(company):
    settings_obj, _ = PayrollSettings.objects.get_or_create(company=company)
    return settings_obj


def compute_pay(monthly_salary, settings_obj, days):
    """Pure calculation, no database access.

    days: list of dicts with worked_minutes, cap_minutes (the shift's full-day
    length) and auto_closed (bool).
    - Minutes up to cap_minutes are paid at the hourly rate.
    - Minutes beyond cap_minutes are overtime, paid at the multiplier.
    - Auto-closed days are paid at the multiplier when pay_auto_closed_shifts
      is on, and held (unpaid) when it is off.
    """
    working_days = Decimal(settings_obj.working_days_per_month)
    standard_hours = Decimal(settings_obj.standard_hours_per_day)
    multiplier = Decimal(settings_obj.overtime_multiplier)
    rate = Decimal(monthly_salary) / (working_days * standard_hours)

    total = Decimal("0")
    regular_minutes = overtime_minutes = auto_closed_minutes = held_minutes = 0

    for day in days:
        minutes = int(day["worked_minutes"])
        if day["auto_closed"]:
            if settings_obj.pay_auto_closed_shifts:
                total += Decimal(minutes) / 60 * rate * multiplier
                auto_closed_minutes += minutes
            else:
                held_minutes += minutes
            continue

        cap = int(day["cap_minutes"])
        regular = min(minutes, cap)
        overtime = max(0, minutes - cap)
        regular_minutes += regular
        overtime_minutes += overtime
        total += Decimal(regular) / 60 * rate
        total += Decimal(overtime) / 60 * rate * multiplier

    return {
        "hourly_rate": money(rate),
        "regular_minutes": regular_minutes,
        "overtime_minutes": overtime_minutes,
        "auto_closed_minutes": auto_closed_minutes,
        "held_minutes": held_minutes,
        "pay": money(total),
    }


def monthly_summary(company, year, month, branch_id=None, employee_id=None):
    settings_obj = get_settings(company)
    first_day = date(year, month, 1)
    last_day = date(year, month, calendar.monthrange(year, month)[1])

    records = (
        AttendanceRecord.objects.select_related("employee__user", "shift")
        .filter(company=company, date__gte=first_day, date__lte=last_day, check_out_time__isnull=False)
        .order_by("employee__employee_code", "date")
    )
    if branch_id:
        records = records.filter(branch_id=branch_id)
    if employee_id:
        records = records.filter(employee_id=employee_id)

    by_employee = {}
    for record in records:
        by_employee.setdefault(record.employee_id, []).append(record)

    rows = []
    for employee_records in by_employee.values():
        employee = employee_records[0].employee
        days = [
            {
                "worked_minutes": r.working_minutes,
                "cap_minutes": r.shift.full_day_minutes if r.shift else DEFAULT_FULL_DAY_MINUTES,
                "auto_closed": r.check_out_source == AttendanceSource.SYSTEM,
            }
            for r in employee_records
        ]
        row = {
            "employee_code": employee.employee_code,
            "employee_name": employee.user.get_full_name(),
            "days_recorded": len(employee_records),
            "late_minutes": sum(r.late_by_minutes for r in employee_records),
            "early_exit_minutes": sum(r.early_exit_by_minutes for r in employee_records),
            "worked_minutes": sum(r.working_minutes for r in employee_records),
            "outside_minutes": sum(r.outside_minutes for r in employee_records),
        }
        if employee.monthly_salary is None:
            row.update({"status": "NO_SALARY", "pay": None, "hourly_rate": None})
        else:
            result = compute_pay(employee.monthly_salary, settings_obj, days)
            row.update({"status": "OK", **result})
        rows.append(row)

    return {
        "year": year,
        "month": month,
        "settings": {
            "working_days_per_month": settings_obj.working_days_per_month,
            "standard_hours_per_day": str(settings_obj.standard_hours_per_day),
            "overtime_multiplier": str(settings_obj.overtime_multiplier),
            "pay_auto_closed_shifts": settings_obj.pay_auto_closed_shifts,
        },
        "rows": rows,
    }

def _minutes_so_far(record, now):
    """Finished shifts use the stored total. Open shifts count elapsed time minus breaks."""
    if record.check_out_time:
        return int(record.working_minutes)
    if not record.check_in_time:
        return 0
    elapsed = int((now - record.check_in_time).total_seconds() // 60)
    return max(0, elapsed - int(record.total_break_minutes or 0))


def _day_entry(record, now):
    cap = record.shift.full_day_minutes if record.shift else DEFAULT_FULL_DAY_MINUTES
    return {
        "worked_minutes": _minutes_so_far(record, now),
        "cap_minutes": cap,
        "auto_closed": record.check_out_source == AttendanceSource.SYSTEM,
    }


def employee_earned_today(employee, now=None):
    """What one employee has earned today so far. Contains no salary or hourly rate."""
    from django.utils import timezone

    now = now or timezone.now()
    today = timezone.localdate(now)
    record = (
        AttendanceRecord.objects.select_related("shift")
        .filter(employee=employee, date=today, check_in_time__isnull=False)
        .order_by("-check_in_time")
        .first()
    )
    checked_in = bool(record and record.check_out_time is None)
    minutes = _minutes_so_far(record, now) if record else 0

    if employee.monthly_salary is None:
        return {"date": str(today), "checked_in": checked_in, "minutes": minutes,
                "earned": None, "salary_set": False}
    if record is None:
        return {"date": str(today), "checked_in": False, "minutes": 0,
                "earned": "0.00", "salary_set": True}

    result = compute_pay(employee.monthly_salary, get_settings(employee.company), [_day_entry(record, now)])
    return {"date": str(today), "checked_in": checked_in, "minutes": minutes,
            "earned": str(result["pay"]), "salary_set": True}


def company_payable_today(company, now=None):
    """Admin view: total payable today across the company, plus one row per employee."""
    from django.utils import timezone

    now = now or timezone.now()
    today = timezone.localdate(now)
    settings_obj = get_settings(company)
    records = (
        AttendanceRecord.objects.select_related("employee__user", "shift")
        .filter(company=company, date=today, check_in_time__isnull=False)
        .order_by("employee__employee_code")
    )

    total = Decimal("0")
    without_salary = 0
    rows = []
    for record in records:
        employee = record.employee
        row = {
            "employee_code": employee.employee_code,
            "employee_name": employee.user.get_full_name(),
            "checked_in": record.check_out_time is None,
            "minutes": _minutes_so_far(record, now),
        }
        if employee.monthly_salary is None:
            without_salary += 1
            row["earned"] = None
        else:
            result = compute_pay(employee.monthly_salary, settings_obj, [_day_entry(record, now)])
            row["earned"] = str(result["pay"])
            total += result["pay"]
        rows.append(row)

    return {
        "date": str(today),
        "total_payable": str(money(total)),
        "employees_counted": len(rows) - without_salary,
        "employees_without_salary": without_salary,
        "rows": rows,
    }
