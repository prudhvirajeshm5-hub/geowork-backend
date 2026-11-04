from datetime import datetime

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsCompanyAdmin
from .models import AttendanceRecord


def _parse_day(raw):
    if not raw:
        return timezone.localdate()
    return datetime.strptime(raw, "%Y-%m-%d").date()


def _record_payload(record, now):
    events, total = [], 0
    for event in record.outside_events.all():
        minutes = int((now - event.left_at).total_seconds() // 60) if event.returned_at is None else event.minutes
        total += minutes
        events.append({
            "left_at": event.left_at.isoformat(),
            "returned_at": event.returned_at.isoformat() if event.returned_at else None,
            "minutes": minutes,
            "still_outside": event.returned_at is None,
        })
    return {"total_minutes": total, "events": events}


class MyOutsideView(APIView):
    """The signed-in employee's own outside periods for a day (default: today)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = getattr(request.user, "employee_profile", None)
        if employee is None:
            return Response({"detail": "No employee profile for this account."}, status=404)
        try:
            day = _parse_day(request.query_params.get("date"))
        except ValueError:
            return Response({"detail": "Use date=YYYY-MM-DD."}, status=400)
        record = AttendanceRecord.objects.filter(employee=employee, date=day).first()
        if record is None:
            return Response({"date": str(day), "total_minutes": 0, "events": []})
        return Response({"date": str(day), **_record_payload(record, timezone.now())})


class CompanyOutsideView(APIView):
    """Admin: every employee who was outside their work area on a day."""

    permission_classes = [IsAuthenticated, IsCompanyAdmin]

    def get(self, request):
        if not request.user.company_id:
            return Response({"detail": "This account is not linked to a company."}, status=400)
        try:
            day = _parse_day(request.query_params.get("date"))
        except ValueError:
            return Response({"detail": "Use date=YYYY-MM-DD."}, status=400)
        now = timezone.now()
        records = (
            AttendanceRecord.objects.select_related("employee__user")
            .prefetch_related("outside_events")
            .filter(company=request.user.company, date=day)
            .order_by("employee__employee_code")
        )
        rows = []
        for record in records:
            payload = _record_payload(record, now)
            if payload["events"]:
                rows.append({
                    "employee_code": record.employee.employee_code,
                    "employee_name": record.employee.user.get_full_name(),
                    **payload,
                })
        return Response({"date": str(day), "rows": rows})
