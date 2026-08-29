from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsManagerOrAdmin, company_scoped_queryset
from attendance.serializers import AttendanceRecordSerializer

from . import services
from .models import EmployeeLiveStatus, LocationPing
from .serializers import EmployeeLiveStatusSerializer, LocationPingSerializer, PingSerializer


class PingView(APIView):
    """
    Module 6 - the mobile app calls this every N seconds/meters of movement
    while a shift is active. Drives the live dashboard AND (via a work-area
    transition) automatically fires Module 5's attendance check-in/out.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        live_status, attendance_record = services.process_ping(
            request.user,
            latitude=data["latitude"],
            longitude=data["longitude"],
            accuracy_meters=data.get("accuracy_meters"),
            battery_level=data.get("battery_level"),
            gps_enabled=data.get("gps_enabled", True),
            network_connected=data.get("network_connected", True),
            recorded_at=data.get("recorded_at"),
        )

        response = {"live_status": EmployeeLiveStatusSerializer(live_status).data}
        if attendance_record is not None:
            response["attendance_update"] = AttendanceRecordSerializer(attendance_record).data
        return Response(response, status=status.HTTP_200_OK)


class LiveDashboardViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Module 6/7 - the "who's where right now" dashboard feed. Manager/admin
    only — this is operational visibility into the whole team, not something
    an individual employee needs about their peers.
    """

    queryset = EmployeeLiveStatus.objects.select_related(
        "employee__user", "branch", "current_work_area"
    ).all()
    serializer_class = EmployeeLiveStatusSerializer
    permission_classes = [IsManagerOrAdmin]
    filterset_fields = ["branch", "current_work_area"]

    def get_queryset(self):
        return company_scoped_queryset(self.queryset, self.request)


class LocationPingHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    """Raw ping history for a single employee — trail/audit view, and the raw material for future distance/route reports."""

    queryset = LocationPing.objects.select_related("employee__user", "work_area").all()
    serializer_class = LocationPingSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["employee", "work_area"]

    def get_queryset(self):
        qs = company_scoped_queryset(self.queryset, self.request)
        user = self.request.user
        if user.is_superuser or user.role in ("ADMIN", "MANAGER"):
            return qs
        employee = getattr(user, "employee_profile", None)
        return qs.filter(employee=employee) if employee else qs.none()
