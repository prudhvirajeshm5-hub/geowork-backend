from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsManagerOrAdmin, ReadOnlyOrAdmin, company_scoped_queryset

from . import services
from .models import Employee, EmployeeTransferRequest
from .serializers import (
    EmployeeCreateSerializer,
    EmployeeSerializer,
    EmployeeStatusSerializer,
    EmployeeTransferRequestSerializer,
    TransferDecisionSerializer,
    TransferRequestCreateSerializer,
)


class EmployeeViewSet(viewsets.ModelViewSet):
    """
    Module 3 - Employee Management.
    List/retrieve: any authenticated user in the tenant (managers need this
    for org lookups). Create/update/delete: managers or admins only.
    Deleting is disabled in favor of disable() to preserve attendance/job
    history; use the `disable`/`enable` action instead.
    """

    queryset = Employee.objects.select_related(
        "user", "company", "branch", "department", "designation", "shift", "manager__user"
    ).all()
    permission_classes = [ReadOnlyOrAdmin]
    filterset_fields = ["status", "branch", "department", "designation", "shift", "manager"]
    search_fields = ["employee_code", "user__first_name", "user__last_name", "user__phone", "user__email"]

    def get_queryset(self):
        return company_scoped_queryset(self.queryset, self.request)

    def get_serializer_class(self):
        if self.action == "create":
            return EmployeeCreateSerializer
        return EmployeeSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "set_status"):
            return [IsManagerOrAdmin()]
        return [ReadOnlyOrAdmin()]

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "Employees cannot be hard-deleted. Use POST /status/ with action=disable instead."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        employee = self.get_object()
        serializer = EmployeeStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data["action"] == "disable":
            employee.disable()
        else:
            employee.enable()
        return Response(EmployeeSerializer(employee, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="transfer")
    def transfer(self, request, pk=None):
        """Request moving this employee to a different branch. Does not take
        effect until the employee's manager (or an admin) approves it —
        see EmployeeTransferViewSet.approve/reject."""
        employee = self.get_object()
        serializer = TransferRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        transfer = services.request_transfer(requested_by=request.user, employee=employee, **serializer.validated_data)
        return Response(
            EmployeeTransferRequestSerializer(transfer, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class EmployeeTransferViewSet(viewsets.ReadOnlyModelViewSet):
    """
    List/inspect transfer requests and decide on pending ones. Creation
    happens via POST /employees/{id}/transfer/ above, not here.
    """

    queryset = EmployeeTransferRequest.objects.select_related(
        "employee__user", "from_branch", "to_branch", "requested_by", "approver__user", "decided_by"
    ).all()
    serializer_class = EmployeeTransferRequestSerializer
    permission_classes = [IsManagerOrAdmin]
    filterset_fields = ["status", "employee", "to_branch"]

    def get_queryset(self):
        return company_scoped_queryset(self.queryset, self.request)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        transfer = self.get_object()
        serializer = TransferDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        transfer = services.approve_transfer(request.user, transfer, **serializer.validated_data)
        return Response(EmployeeTransferRequestSerializer(transfer, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        transfer = self.get_object()
        serializer = TransferDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        transfer = services.reject_transfer(request.user, transfer, **serializer.validated_data)
        return Response(EmployeeTransferRequestSerializer(transfer, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        transfer = self.get_object()
        transfer = services.cancel_transfer(request.user, transfer)
        return Response(EmployeeTransferRequestSerializer(transfer, context={"request": request}).data)