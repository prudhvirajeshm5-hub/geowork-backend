import csv

from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.permissions import IsCompanyAdmin
from . import services
from .models import PayrollSettings
from .serializers import PayrollSettingsSerializer


def _no_company_response():
    return Response({"detail": "This account is not linked to a company."}, status=400)


class PayrollSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsCompanyAdmin]

    def get(self, request):
        if not request.user.company_id:
            return _no_company_response()
        settings_obj, _ = PayrollSettings.objects.get_or_create(company=request.user.company)
        return Response(PayrollSettingsSerializer(settings_obj).data)

    def patch(self, request):
        if not request.user.company_id:
            return _no_company_response()
        settings_obj, _ = PayrollSettings.objects.get_or_create(company=request.user.company)
        serializer = PayrollSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class MonthlyPayrollView(APIView):
    """Salary-based pay for one month. Admin only, because it shows salaries."""

    permission_classes = [IsAuthenticated, IsCompanyAdmin]

    def get(self, request):
        if not request.user.company_id:
            return _no_company_response()
        try:
            year = int(request.query_params["year"])
            month = int(request.query_params["month"])
            if not 1 <= month <= 12:
                raise ValueError
        except (KeyError, ValueError):
            return Response({"detail": "Provide year and month (month 1-12)."}, status=400)

        summary = services.monthly_summary(
            request.user.company,
            year,
            month,
            branch_id=request.query_params.get("branch"),
            employee_id=request.query_params.get("employee"),
        )

        if request.query_params.get("format") == "csv":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="payroll-{year}-{month:02d}.csv"'
            writer = csv.writer(response)
            writer.writerow([
                "Employee Code", "Employee Name", "Days", "Worked (min)", "Regular (min)",
                "Overtime (min)", "Auto-closed (min)", "Held (min)", "Late (min)",
                "Early exit (min)", "Outside work area (min)", "Hourly rate", "Pay", "Status",
            ])
            for r in summary["rows"]:
                writer.writerow([
                    r["employee_code"], r["employee_name"], r["days_recorded"], r["worked_minutes"],
                    r.get("regular_minutes", ""), r.get("overtime_minutes", ""),
                    r.get("auto_closed_minutes", ""), r.get("held_minutes", ""),
                    r["late_minutes"], r["early_exit_minutes"], r["outside_minutes"],
                    r["hourly_rate"] if r["hourly_rate"] is not None else "",
                    r["pay"] if r["pay"] is not None else "", r["status"],
                ])
            return response

        return Response(summary)

class TodayPayrollSummaryView(APIView):
    """Admin only: total payable today for the whole company."""

    permission_classes = [IsAuthenticated, IsCompanyAdmin]

    def get(self, request):
        if not request.user.company_id:
            return _no_company_response()
        return Response(services.company_payable_today(request.user.company))


class MyEarningsTodayView(APIView):
    """Any employee: what they have earned today so far. No salary is returned."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, "employee_profile"):
            return Response({"detail": "No employee profile for this account."}, status=404)
        return Response(services.employee_earned_today(request.user.employee_profile))

class MyMonthlyPayView(APIView):
    """The signed-in employee's own pay for a month. Returns the total only, never salary or rates."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.utils import timezone

        employee = getattr(request.user, "employee_profile", None)
        if employee is None:
            return Response({"detail": "No employee profile for this account."}, status=404)
        today = timezone.localdate()
        try:
            year = int(request.query_params.get("year", today.year))
            month = int(request.query_params.get("month", today.month))
            if not 1 <= month <= 12:
                raise ValueError
        except ValueError:
            return Response({"detail": "Provide year and month (month 1-12)."}, status=400)

        summary = services.monthly_summary(employee.company, year, month, employee_id=employee.id)
        row = summary["rows"][0] if summary["rows"] else None
        pay = row["pay"] if row else "0.00"
        return Response({
            "year": year,
            "month": month,
            "pay": str(pay) if pay is not None else None,
            "salary_set": employee.monthly_salary is not None,
            "days_recorded": row["days_recorded"] if row else 0,
        })
