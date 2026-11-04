from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsCompanyAdmin
from .models import Complaint


def _employee(request):
    return getattr(request.user, "employee_profile", None)


def _as_dict(c):
    return {
        "id": c.id,
        "category": c.get_category_display(),
        "category_code": c.category,
        "priority": c.get_priority_display(),
        "priority_code": c.priority,
        "subject": c.subject,
        "description": c.description,
        "status": c.status,
        "resolution_note": c.resolution_note,
        "created_at": c.created_at.isoformat(),
    }


class ComplaintListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = _employee(request)
        if employee is None:
            return Response({"detail": "No employee profile for this account."}, status=404)
        rows = Complaint.objects.filter(employee=employee)[:100]
        return Response({"results": [_as_dict(c) for c in rows]})

    def post(self, request):
        employee = _employee(request)
        if employee is None:
            return Response({"detail": "No employee profile for this account."}, status=404)
        category = request.data.get("category")
        priority = request.data.get("priority") or Complaint.Priority.MEDIUM
        subject = str(request.data.get("subject") or "").strip()
        description = str(request.data.get("description") or "").strip()
        if category not in Complaint.Category.values:
            return Response({"detail": "Choose a valid category."}, status=400)
        if priority not in Complaint.Priority.values:
            return Response({"detail": "Choose a valid priority."}, status=400)
        if not subject or not description:
            return Response({"detail": "Subject and description are required."}, status=400)
        complaint = Complaint.objects.create(
            company=employee.company,
            employee=employee,
            category=category,
            priority=priority,
            subject=subject[:150],
            description=description[:2000],
        )
        return Response(_as_dict(complaint), status=201)


class CompanyComplaintsView(APIView):
    """Admin: every complaint in the company, optionally filtered by ?status=."""

    permission_classes = [IsAuthenticated, IsCompanyAdmin]

    def get(self, request):
        rows = Complaint.objects.filter(company=request.user.company)
        status_filter = request.query_params.get("status")
        if status_filter:
            rows = rows.filter(status=status_filter)
        rows = rows.select_related("employee__user")[:200]
        results = [
            dict(_as_dict(c), employee_name=c.employee.user.get_full_name())
            for c in rows
        ]
        return Response({"results": results})


class ComplaintUpdateView(APIView):
    """Admin: move a complaint to in progress or resolved, with an optional note."""

    permission_classes = [IsAuthenticated, IsCompanyAdmin]

    def patch(self, request, pk):
        complaint = Complaint.objects.filter(pk=pk, company=request.user.company).first()
        if complaint is None:
            return Response({"detail": "Not found."}, status=404)
        status_value = request.data.get("status")
        if status_value is not None:
            if status_value not in Complaint.Status.values:
                return Response({"detail": "Choose a valid status."}, status=400)
            complaint.status = status_value
        if "resolution_note" in request.data:
            complaint.resolution_note = str(request.data.get("resolution_note") or "")[:255]
        complaint.save(update_fields=["status", "resolution_note", "updated_at"])
        return Response(_as_dict(complaint))
