"""
End-of-day absentee marking. Meant to run once daily (after the latest
shift's end_time across all companies) via Celery beat — see README for the
schedule snippet. Exposed as a plain function too so the management command
and any future admin "mark absent now" action can call it without needing a
Celery worker running (e.g. in local dev).
"""
from celery import shared_task
from django.utils import timezone

from employees.models import Employee
from notifications import services as notification_services

from .models import AttendanceRecord, AttendanceSource, AttendanceStatus


def mark_absentees_for_date(target_date=None):
    target_date = target_date or timezone.localdate()
    marked = 0

    active_employees = Employee.objects.filter(status=Employee.Status.ACTIVE).exclude(
        attendance_records__date=target_date
    )
    for employee in active_employees.iterator():
        AttendanceRecord.objects.create(
            employee=employee,
            company=employee.company,
            branch=employee.branch,
            shift=employee.shift,
            date=target_date,
            status=AttendanceStatus.ABSENT,
            check_in_source=AttendanceSource.SYSTEM,
        )
        notification_services.notify_absent(employee, target_date)
        marked += 1
    return marked


@shared_task
def mark_absentees_task(target_date_iso=None):
    target_date = timezone.datetime.fromisoformat(target_date_iso).date() if target_date_iso else None
    return mark_absentees_for_date(target_date)
