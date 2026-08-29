from django.http import HttpResponse
from django.utils.dateparse import parse_date
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from companies.models import Branch

from . import services
from .exporters import export_excel, export_pdf


def _slugify(title):
    return "".join(c if c.isalnum() else "-" for c in title.lower()).strip("-")


class BaseReportView(APIView):
    """
    Shared plumbing for every report endpoint below: resolves the effective
    (company, branch, employee) scope — restricting a plain employee to
    their own data only, the same RBAC pattern Attendance (Module 5) uses —
    parses `?export=excel|pdf` (defaults to JSON if omitted; note this is
    deliberately NOT named `format`, since DRF reserves that query param
    for its own content-negotiation and silently 404s on an unrecognized
    value), and renders whichever format was asked for from the report
    dict the subclass builds.
    """

    permission_classes = [IsAuthenticated]

    def get_scope(self, request):
        user = request.user
        branch_id = request.query_params.get("branch")
        employee_id = request.query_params.get("employee")

        is_privileged = user.is_superuser or user.role in ("ADMIN", "MANAGER")
        if not is_privileged:
            employee = getattr(user, "employee_profile", None)
            employee_id = employee.id if employee else -1  # -1: no profile -> guaranteed-empty result set

        if branch_id and not Branch.objects.filter(id=branch_id, company_id=user.company_id).exists():
            return None, None, None, Response({"detail": "branch not found for your company."}, status=404)

        return user.company_id, branch_id, employee_id, None

    def render_report(self, request, report):
        export_format = request.query_params.get("export", "json")
        if export_format == "excel":
            buffer = export_excel(report)
            response = HttpResponse(
                buffer.getvalue(),
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            response["Content-Disposition"] = f'attachment; filename="{_slugify(report["title"])}.xlsx"'
            return response
        if export_format == "pdf":
            buffer = export_pdf(report)
            response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
            response["Content-Disposition"] = f'attachment; filename="{_slugify(report["title"])}.pdf"'
            return response
        return Response(report)

    def parse_required_date(self, request, param):
        raw = request.query_params.get(param)
        if not raw:
            return None, Response({"detail": f"{param} is required (YYYY-MM-DD)."}, status=400)
        parsed = parse_date(raw)
        if parsed is None:
            return None, Response({"detail": f"{param} must be in YYYY-MM-DD format."}, status=400)
        return parsed, None


class DailyAttendanceReportView(BaseReportView):
    def get(self, request):
        company_id, branch_id, employee_id, error = self.get_scope(request)
        if error:
            return error
        target_date, error = self.parse_required_date(request, "date")
        if error:
            return error
        report = services.daily_attendance_report(company_id, target_date, branch_id, employee_id)
        return self.render_report(request, report)


class MonthlyAttendanceReportView(BaseReportView):
    def get(self, request):
        company_id, branch_id, employee_id, error = self.get_scope(request)
        if error:
            return error
        try:
            year = int(request.query_params.get("year"))
            month = int(request.query_params.get("month"))
            assert 1 <= month <= 12
        except (TypeError, ValueError, AssertionError):
            return Response({"detail": "year and month (1-12) are required."}, status=400)
        report = services.monthly_attendance_report(company_id, year, month, branch_id, employee_id)
        return self.render_report(request, report)


class WorkingHoursReportView(BaseReportView):
    def get(self, request):
        company_id, branch_id, employee_id, error = self.get_scope(request)
        if error:
            return error
        date_from, error = self.parse_required_date(request, "date_from")
        if error:
            return error
        date_to, error = self.parse_required_date(request, "date_to")
        if error:
            return error
        report = services.working_hours_report(company_id, date_from, date_to, branch_id, employee_id)
        return self.render_report(request, report)


class LateReportView(BaseReportView):
    def get(self, request):
        company_id, branch_id, employee_id, error = self.get_scope(request)
        if error:
            return error
        date_from, error = self.parse_required_date(request, "date_from")
        if error:
            return error
        date_to, error = self.parse_required_date(request, "date_to")
        if error:
            return error
        report = services.late_report(company_id, date_from, date_to, branch_id, employee_id)
        return self.render_report(request, report)


class OvertimeReportView(BaseReportView):
    def get(self, request):
        company_id, branch_id, employee_id, error = self.get_scope(request)
        if error:
            return error
        date_from, error = self.parse_required_date(request, "date_from")
        if error:
            return error
        date_to, error = self.parse_required_date(request, "date_to")
        if error:
            return error
        report = services.overtime_report(company_id, date_from, date_to, branch_id, employee_id)
        return self.render_report(request, report)


class AttendancePercentageReportView(BaseReportView):
    def get(self, request):
        company_id, branch_id, employee_id, error = self.get_scope(request)
        if error:
            return error
        date_from, error = self.parse_required_date(request, "date_from")
        if error:
            return error
        date_to, error = self.parse_required_date(request, "date_to")
        if error:
            return error
        report = services.attendance_percentage_report(company_id, date_from, date_to, branch_id, employee_id)
        return self.render_report(request, report)
