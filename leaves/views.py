import datetime

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from . import services
from .models import LeaveRequest, LeaveType


def _employee(request):
    return getattr(request.user, "employee_profile", None)


def _no_employee():
    return Response({"detail": "No employee profile for this account."}, status=404)


class LeaveBalanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = _employee(request)
        if employee is None:
            return _no_employee()
        year = timezone.localdate().year
        return Response({"year": year, "balances": services.balances_for(employee, year)})


class LeaveListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = _employee(request)
        if employee is None:
            return _no_employee()
        rows = LeaveRequest.objects.select_related("leave_type").filter(employee=employee)[:100]
        return Response({"results": [services.as_dict(r) for r in rows]})

    def post(self, request):
        employee = _employee(request)
        if employee is None:
            return _no_employee()
        try:
            leave_type = LeaveType.objects.get(pk=request.data.get("leave_type"), company=employee.company)
            start = datetime.date.fromisoformat(str(request.data.get("from_date", "")))
            end = datetime.date.fromisoformat(str(request.data.get("to_date", "")))
        except (LeaveType.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Choose a leave type and valid dates."}, status=400)
        if end < start:
            return Response({"detail": "End date cannot be before start date."}, status=400)
        if services.overlapping(employee, start, end):
            return Response({"detail": "You already have a pending or approved leave in these dates."}, status=400)
        leave = LeaveRequest.objects.create(
            company=employee.company,
            employee=employee,
            leave_type=leave_type,
            from_date=start,
            to_date=end,
            reason=str(request.data.get("reason") or "")[:1000],
        )
        return Response(services.as_dict(leave), status=201)


class LeaveCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        employee = _employee(request)
        if employee is None:
            return _no_employee()
        leave = LeaveRequest.objects.select_related("leave_type").filter(pk=pk, employee=employee).first()
        if leave is None:
            return Response({"detail": "Not found."}, status=404)
        upcoming = leave.from_date > timezone.localdate()
        if leave.status == LeaveRequest.Status.PENDING or (
            leave.status == LeaveRequest.Status.APPROVED and upcoming
        ):
            leave.status = LeaveRequest.Status.CANCELLED
            leave.save(update_fields=["status", "updated_at"])
            return Response(services.as_dict(leave))
        return Response({"detail": "This leave can no longer be cancelled."}, status=400)


class LeavePendingView(APIView):
    """Pending requests the signed-in user can decide: their team's, or all for admins."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = _employee(request)
        if employee is None:
            return _no_employee()
        rows = LeaveRequest.objects.select_related("leave_type", "employee__user").filter(
            company=employee.company, status=LeaveRequest.Status.PENDING
        )
        if request.user.role != Role.ADMIN:
            rows = rows.filter(employee__manager=employee)
        results = [
            dict(services.as_dict(r), employee_name=r.employee.user.get_full_name())
            for r in rows[:200]
        ]
        return Response({"results": results})


class LeaveDecideView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        employee = _employee(request)
        if employee is None:
            return _no_employee()
        leave = (
            LeaveRequest.objects.select_related("leave_type", "employee")
            .filter(pk=pk, company=employee.company)
            .first()
        )
        if leave is None:
            return Response({"detail": "Not found."}, status=404)
        is_admin = request.user.role == Role.ADMIN
        if not (is_admin or leave.employee.manager_id == employee.id):
            return Response({"detail": "Only the employee's manager or an admin can decide this."}, status=403)
        if leave.status != LeaveRequest.Status.PENDING:
            return Response({"detail": "Only pending requests can be decided."}, status=400)

        action = request.data.get("action")
        if action == "approve":
            balance = next(
                (b for b in services.balances_for(leave.employee, leave.from_date.year) if b["id"] == leave.leave_type_id),
                None,
            )
            if balance and leave.days > balance["remaining"]:
                return Response(
                    {"detail": f"Not enough balance: {balance['remaining']} day(s) left."}, status=400
                )
            leave.status = LeaveRequest.Status.APPROVED
        elif action == "reject":
            leave.status = LeaveRequest.Status.REJECTED
        else:
            return Response({"detail": "action must be approve or reject."}, status=400)

        leave.decided_by = employee
        leave.decided_at = timezone.now()
        leave.decision_note = str(request.data.get("note") or "")[:255]
        leave.save(update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"])
        return Response(services.as_dict(leave))


class LeaveAdminListView(APIView):
    """Admin: every leave request in the company. Optional ?month=YYYY-MM and ?status=."""

    def get(self, request):
        profile = getattr(request.user, "employee_profile", None)
        if profile is None or getattr(request.user, "role", "") != "ADMIN":
            return Response({"detail": "Only admins can view all leave requests."}, status=403)
        rows = LeaveRequest.objects.select_related(
            "leave_type", "employee__user", "employee__department"
        ).filter(company=profile.company)
        status_value = request.query_params.get("status")
        if status_value:
            rows = rows.filter(status=status_value)
        month = request.query_params.get("month")
        if month:
            try:
                year, mon = (int(part) for part in month.split("-"))
            except ValueError:
                return Response({"detail": "month must be YYYY-MM."}, status=400)
            rows = rows.filter(from_date__year=year, from_date__month=mon)
        results = [
            {
                "id": r.id,
                "employee_name": r.employee.user.get_full_name(),
                "employee_code": r.employee.employee_code,
                "department": r.employee.department.name if r.employee.department_id else "",
                "leave_type_code": r.leave_type.code,
                "leave_type_name": r.leave_type.name,
                "from_date": r.from_date.isoformat(),
                "to_date": r.to_date.isoformat(),
                "days": (r.to_date - r.from_date).days + 1,
                "status": r.status,
                "reason": r.reason,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows[:500]
        ]
        return Response({"results": results})


class LeaveTypesView(APIView):
    """The company's leave types, with their yearly allowance."""

    def get(self, request):
        profile = getattr(request.user, "employee_profile", None)
        if profile is None:
            return Response({"detail": "No employee profile for this account."}, status=404)
        types = LeaveType.objects.filter(company=profile.company).values("id", "code", "name", "annual_allowance")
        return Response({"results": list(types)})

