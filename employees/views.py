from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.audit import log_action
from accounts.models import AuditLog, OTP
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


class AdminResetPasswordRequestSerializer(serializers.Serializer):
    # "send_link" (Option A, recommended): employee gets an OTP and sets
    # their own new password through the existing forgot-password flow.
    # "temporary_password" (Option B): admin gets a one-time temp password
    # to relay out-of-band; the employee is forced to change it on next login.
    mode = serializers.ChoiceField(choices=["send_link", "temporary_password"], default="send_link")


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
        if self.action in ("create", "update", "partial_update", "destroy", "set_status", "reset_password"):
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
            log_action(
                AuditLog.Action.EMPLOYEE_DISABLED, performed_by=request.user, target_user=employee.user, request=request
            )
        else:
            employee.enable()
            log_action(
                AuditLog.Action.EMPLOYEE_ENABLED, performed_by=request.user, target_user=employee.user, request=request
            )
        return Response(EmployeeSerializer(employee, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        """
        Employee Profile -> Security -> Reset Password (V1.1 admin/manager
        password reset). The admin/manager never sees or sets the account's
        real password directly for "send_link" mode; for "temporary_password"
        mode they get a one-time value to relay to the employee, and the
        employee is forced to change it before doing anything else.
        """
        from django.utils.crypto import get_random_string

        from accounts.views import send_otp_sms

        employee = self.get_object()
        target_user = employee.user
        serializer = AdminResetPasswordRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mode = serializer.validated_data["mode"]

        if mode == "send_link":
            otp = OTP.objects.create(phone=target_user.phone, purpose=OTP.Purpose.RESET_PASSWORD)
            send_otp_sms(target_user.phone, otp.code, OTP.Purpose.RESET_PASSWORD)
            log_action(
                AuditLog.Action.ADMIN_PASSWORD_RESET_INITIATED,
                performed_by=request.user,
                target_user=target_user,
                request=request,
                metadata={"mode": mode},
            )
            return Response({"detail": f"A password reset code has been sent to {target_user.phone}."})

        # temporary_password mode — generated fresh every call, never
        # derived from or able to reveal the existing (hashed) password.
        temp_password = get_random_string(
            length=10, allowed_chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
        )
        target_user.set_password(temp_password)
        target_user.must_change_password = True
        target_user.save(update_fields=["password", "must_change_password"])
        log_action(
            AuditLog.Action.ADMIN_TEMP_PASSWORD_SET,
            performed_by=request.user,
            target_user=target_user,
            request=request,
            metadata={"mode": mode},
        )
        return Response({"temporary_password": temp_password})

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