from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import company_scoped_queryset
from employees.models import Employee

from . import services
from .models import AttendanceRecord, OutdoorDutyRequest
from .serializers import (
    AttendanceRecordSerializer,
    CheckPointSerializer,
    GeofenceEventSerializer,
    OutdoorDutyDecisionSerializer,
    OutdoorDutyRequestCreateSerializer,
    OutdoorDutyRequestSerializer,
)


class StartShiftView(APIView):
    """Module 5 - manual 'Start Shift'. Employee must be inside an active work area."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CheckPointSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = services.start_shift(
            request.user, serializer.validated_data["latitude"], serializer.validated_data["longitude"]
        )
        return Response(AttendanceRecordSerializer(record).data, status=status.HTTP_200_OK)


class EndShiftView(APIView):
    """Module 5 - manual 'End Shift'. Computes working hours, early-exit, half-day status."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CheckPointSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = services.end_shift(
            request.user, serializer.validated_data["latitude"], serializer.validated_data["longitude"]
        )
        return Response(AttendanceRecordSerializer(record).data, status=status.HTTP_200_OK)


class GeofenceEventView(APIView):
    """
    Module 5 - Auto Check-In / Auto Check-Out. Called by the mobile app's
    background geofence listener (and, in Module 6, the live-tracking
    pipeline) when the employee crosses a work-area boundary.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = GeofenceEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        record = services.process_geofence_event(
            request.user, data["event_type"], data["latitude"], data["longitude"]
        )
        return Response(AttendanceRecordSerializer(record).data, status=status.HTTP_200_OK)


class TodayAttendanceView(APIView):
    """Convenience endpoint: the current user's own attendance record for today."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = getattr(request.user, "employee_profile", None)
        if employee is None:
            return Response({"detail": "This account has no employee profile."}, status=status.HTTP_404_NOT_FOUND)
        record = services.get_or_create_today_record(employee)
        return Response(AttendanceRecordSerializer(record).data)


class AttendanceRecordViewSet(viewsets.ReadOnlyModelViewSet):
    """
    History/reporting view. Employees see only their own records; managers
    and admins (any non-employee-scoped tenant user, enforced below) see
    every record in their company. Read-only — records are only ever
    written through start/end-shift or the geofence-event flow above.
    """

    queryset = AttendanceRecord.objects.select_related(
        "employee__user", "branch", "shift", "check_in_work_area", "check_out_work_area"
    ).all()
    serializer_class = AttendanceRecordSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["employee", "branch", "status", "date", "is_late", "is_early_exit"]

    def get_queryset(self):
        qs = company_scoped_queryset(self.queryset, self.request)
        user = self.request.user
        if user.is_superuser or user.role in ("ADMIN", "MANAGER"):
            return qs
        employee = getattr(user, "employee_profile", None)
        return qs.filter(employee=employee) if employee else qs.none()


class OutdoorDutyViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Request/approve/reject/cancel exemption from the work-area requirement
    for a date range (client visits, field sales, etc). Any employee can
    request this for themselves; requesting on behalf of someone else
    requires being a manager or admin. See attendance/services.py for the
    actual approval rules.
    """

    queryset = OutdoorDutyRequest.objects.select_related(
        "employee__user", "requested_by", "approver__user", "decided_by"
    ).all()
    serializer_class = OutdoorDutyRequestSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status", "employee"]

    def get_queryset(self):
        qs = company_scoped_queryset(self.queryset, self.request)
        user = self.request.user
        if user.is_superuser or user.role in ("ADMIN", "MANAGER"):
            return qs
        employee = getattr(user, "employee_profile", None)
        return qs.filter(employee=employee) if employee else qs.none()

    def create(self, request, *args, **kwargs):
        serializer = OutdoorDutyRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        employee_id = data.pop("employee", None)
        if employee_id:
            employee = Employee.objects.filter(id=employee_id, company_id=request.user.company_id).first()
            if employee is None:
                return Response({"employee": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            employee = getattr(request.user, "employee_profile", None)
            if employee is None:
                return Response(
                    {"detail": "This account has no employee profile."}, status=status.HTTP_400_BAD_REQUEST
                )

        request_obj = services.request_outdoor_duty(requested_by=request.user, employee=employee, **data)
        return Response(
            OutdoorDutyRequestSerializer(request_obj, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        request_obj = self.get_object()
        serializer = OutdoorDutyDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_obj = services.approve_outdoor_duty(request.user, request_obj, **serializer.validated_data)
        return Response(OutdoorDutyRequestSerializer(request_obj, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        request_obj = self.get_object()
        serializer = OutdoorDutyDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_obj = services.reject_outdoor_duty(request.user, request_obj, **serializer.validated_data)
        return Response(OutdoorDutyRequestSerializer(request_obj, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        request_obj = self.get_object()
        request_obj = services.cancel_outdoor_duty(request.user, request_obj)
        return Response(OutdoorDutyRequestSerializer(request_obj, context={"request": request}).data)