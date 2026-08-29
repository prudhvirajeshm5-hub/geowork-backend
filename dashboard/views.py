from django.utils.dateparse import parse_date
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsManagerOrAdmin
from companies.models import Branch

from .serializers import DashboardSummarySerializer
from .services import get_dashboard_summary


class DashboardSummaryView(APIView):
    """
    Module 7 - the "Today's Employees / Present / Absent / Late / Working /
    Outside Work Area / GPS Disabled / Jobs" tile row. Manager/Admin only.

    Query params:
      date   - YYYY-MM-DD, defaults to today. Only affects the
               attendance-derived tiles (present/absent/half_day/late);
               working/outside_work_area/gps_disabled are always live.
      branch - branch id, defaults to the whole company.
    """

    permission_classes = [IsManagerOrAdmin]

    def get(self, request):
        user = request.user
        if not user.company_id and not user.is_superuser:
            return Response({"detail": "This account has no company to report on."}, status=400)

        branch_id = request.query_params.get("branch")
        if branch_id:
            if not Branch.objects.filter(id=branch_id, company_id=user.company_id).exists() and not user.is_superuser:
                return Response({"detail": "branch not found for your company."}, status=404)

        date_param = request.query_params.get("date")
        target_date = parse_date(date_param) if date_param else None
        if date_param and target_date is None:
            return Response({"detail": "date must be in YYYY-MM-DD format."}, status=400)

        summary = get_dashboard_summary(
            company_id=user.company_id, branch_id=branch_id, target_date=target_date
        )
        return Response(DashboardSummarySerializer(summary).data)
