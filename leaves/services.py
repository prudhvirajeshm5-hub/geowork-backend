from django.utils import timezone

from .models import DEFAULT_LEAVE_TYPES, LeaveRequest, LeaveType


def leave_types_for(company):
    for code, name, allowance in DEFAULT_LEAVE_TYPES:
        LeaveType.objects.get_or_create(
            company=company, code=code, defaults={"name": name, "annual_allowance": allowance}
        )
    return LeaveType.objects.filter(company=company)


def balances_for(employee, year=None):
    year = year or timezone.localdate().year
    rows = []
    for leave_type in leave_types_for(employee.company):
        used = sum(
            r.days
            for r in LeaveRequest.objects.filter(
                employee=employee,
                leave_type=leave_type,
                status=LeaveRequest.Status.APPROVED,
                from_date__year=year,
            )
        )
        rows.append({
            "id": leave_type.id,
            "code": leave_type.code,
            "name": leave_type.name,
            "allowance": leave_type.annual_allowance,
            "used": used,
            "remaining": max(0, leave_type.annual_allowance - used),
        })
    return rows


def overlapping(employee, start, end):
    return LeaveRequest.objects.filter(
        employee=employee,
        status__in=[LeaveRequest.Status.PENDING, LeaveRequest.Status.APPROVED],
        from_date__lte=end,
        to_date__gte=start,
    ).exists()


def as_dict(r):
    return {
        "id": r.id,
        "leave_type": r.leave_type.name,
        "leave_type_id": r.leave_type_id,
        "from_date": str(r.from_date),
        "to_date": str(r.to_date),
        "days": r.days,
        "reason": r.reason,
        "status": r.status,
        "decision_note": r.decision_note,
    }
