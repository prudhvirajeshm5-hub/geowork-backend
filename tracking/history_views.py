from datetime import date

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsCompanyAdmin
from employees.models import Employee

from .history import build_history


def _parse_day(value):
    if not value:
        return timezone.localdate()
    return date.fromisoformat(value)


class MyLocationHistoryView(APIView):
    """The signed-in employee's own places and times for a day (?date=YYYY-MM-DD)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = getattr(request.user, "employee_profile", None)
        if employee is None:
            return Response({"detail": "No employee profile for this account."}, status=404)
        try:
            day = _parse_day(request.query_params.get("date"))
        except ValueError:
            return Response({"detail": "date must be YYYY-MM-DD."}, status=400)
        return Response(build_history(employee, day, include_points=False))


class AdminLocationHistoryView(APIView):
    """Admin: one employee's day, including every raw reading (?employee_id=&date=YYYY-MM-DD)."""

    permission_classes = [IsAuthenticated, IsCompanyAdmin]

    def get(self, request):
        try:
            employee = Employee.objects.get(
                pk=int(request.query_params.get("employee_id", "")), company=request.user.company
            )
        except (Employee.DoesNotExist, TypeError, ValueError):
            return Response({"detail": "Provide a valid employee_id from your company."}, status=400)
        try:
            day = _parse_day(request.query_params.get("date"))
        except ValueError:
            return Response({"detail": "date must be YYYY-MM-DD."}, status=400)
        return Response(build_history(employee, day, include_points=True))
