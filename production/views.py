"""
Production Stage Completion API.

Every view here determines "which employee" from `request.user`, never
from a client-supplied ID (spec #17) — see `_employee_or_403`.
"""
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.audit import log_action
from accounts.models import AuditLog
from accounts.permissions import IsManagerOrAdmin, company_scoped_queryset
from geofence.services import find_containing_work_area
from notifications.services import _notify_manager

from .models import ProductionOrder, ProductionStage, StageAssignment, StageCompletion, StageCompletionCorrection
from .serializers import (
    CompleteStageSerializer,
    MyTaskSerializer,
    ProductionOrderProgressSerializer,
    ProductionStageSerializer,
    StageAssignmentCreateSerializer,
)


def _employee_or_403(user):
    employee = getattr(user, "employee_profile", None)
    if employee is None:
        raise PermissionDenied("This account has no employee profile.")
    return employee


class ProductionStageListView(generics.ListAPIView):
    """GET /api/production/stages/ — the configured stage catalog (spec #7)."""

    serializer_class = ProductionStageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ProductionStage.objects.filter(is_active=True)
        return company_scoped_queryset(qs, self.request).order_by("sequence")


class MyTasksView(generics.ListAPIView):
    """GET /api/production/my-tasks/ — spec #1's "My Production" list."""

    serializer_class = MyTaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        employee = _employee_or_403(self.request.user)
        return (
            StageAssignment.objects.filter(employee=employee)
            .select_related("order", "stage", "completion")
            .order_by("completion", "stage__sequence")
        )


class MyHistoryView(generics.ListAPIView):
    """GET /api/production/my-history/ — spec #14. Read-only, no edit path exists."""

    serializer_class = MyTaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        employee = _employee_or_403(self.request.user)
        return (
            StageAssignment.objects.filter(employee=employee, completion__isnull=False)
            .select_related("order", "stage", "completion")
            .order_by("-completion__completed_at")
        )


class CompleteStageView(APIView):
    """
    POST /api/production/stages/{assignment_id}/complete/

    Spec #20's whole flow lives here: this is called ONLY when the employee
    manually presses the button — nothing elsewhere in the app (tracking's
    geofence-ping handler, attendance) calls this. Entering a geofence
    never completes a stage by itself.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, assignment_id):
        employee = _employee_or_403(request.user)
        # Ownership check (spec #17): the assignment must be this
        # employee's own — a stranger's assignment ID returns 404, not 403,
        # so as to not even confirm the ID exists.
        assignment = get_object_or_404(
            StageAssignment.objects.select_related("stage", "order", "company"),
            id=assignment_id, employee=employee,
        )

        serializer = CompleteStageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Idempotency (spec #5/#18): if this exact client-generated key was
        # already recorded — for this employee — return the existing
        # completion instead of erroring, so an offline-queue retry after
        # an uncertain network result is always safe to resend as-is.
        idempotency_key = data.get("idempotency_key") or ""
        if idempotency_key:
            existing = StageCompletion.objects.filter(idempotency_key=idempotency_key, employee=employee).first()
            if existing is not None:
                return Response(self._completion_payload(existing), status=status.HTTP_200_OK)

        if hasattr(assignment, "completion"):
            # Already completed through a different request (e.g. two taps
            # racing without a shared idempotency key) — the OneToOneField
            # already prevents a duplicate row; just report the state.
            return Response(
                {"detail": "This stage was already marked complete.", **self._completion_payload(assignment.completion)},
                status=status.HTTP_409_CONFLICT,
            )

        stage = assignment.stage
        if stage.remarks_required and not data.get("remarks"):
            raise ValidationError({"remarks": "Remarks are required for this stage."})
        if stage.photo_required and not data.get("photo"):
            raise ValidationError({"photo": "A completion photo is required for this stage."})

        work_area = None
        location_verified = False
        latitude, longitude = data.get("latitude"), data.get("longitude")

        if stage.location_verification_required:
            if latitude is None or longitude is None:
                raise ValidationError(
                    {"location": "Your location is required to complete this stage. Enable GPS and try again."}
                )
            work_area = find_containing_work_area(
                employee.company_id, latitude, longitude, branch_id=employee.branch_id
            )
            if work_area is None:
                raise ValidationError(
                    {
                        "location": "You're outside the assigned work area. "
                        "Please move to the designated production area and try again."
                    }
                )
            location_verified = True
        elif latitude is not None and longitude is not None:
            # GPS isn't mandatory here (spec #6), but record it opportunistically
            # if the app already had a fix — useful context, not a gate.
            work_area = find_containing_work_area(employee.company_id, latitude, longitude, branch_id=employee.branch_id)

        try:
            with transaction.atomic():
                completion = StageCompletion.objects.create(
                    assignment=assignment,
                    company=assignment.company,
                    employee=employee,
                    idempotency_key=idempotency_key or None,
                    completed_at=timezone.now(),  # server timestamp is authoritative — spec #3
                    device_reported_at=data.get("device_reported_at"),
                    latitude=latitude,
                    longitude=longitude,
                    location_verified=location_verified,
                    work_area=work_area,
                    device_id=data.get("device_id", ""),
                    remarks=data.get("remarks", ""),
                    photo=data.get("photo"),
                )
        except IntegrityError:
            # Lost a race against a concurrent request for the same
            # assignment/idempotency_key — someone else's completion won;
            # report the state rather than 500ing.
            assignment.refresh_from_db()
            if hasattr(assignment, "completion"):
                return Response(
                    {"detail": "This stage was already marked complete.", **self._completion_payload(assignment.completion)},
                    status=status.HTTP_409_CONFLICT,
                )
            raise

        _notify_manager(
            employee,
            "production_stage_completed",
            "Production stage completed",
            f"{stage.name} completed for {assignment.order.vehicle_reference} by "
            f"{employee.user.get_full_name()} at {timezone.localtime(completion.completed_at):%I:%M %p}.",
        )

        return Response(self._completion_payload(completion), status=status.HTTP_201_CREATED)

    @staticmethod
    def _completion_payload(completion):
        return {
            "id": completion.id,
            "status": "COMPLETED",
            "completed_at": completion.completed_at,
            "completed_by": completion.employee.user.get_full_name(),
            "location_verified": completion.location_verified,
            "remarks": completion.remarks,
        }


class OrderProgressView(generics.RetrieveAPIView):
    """GET /api/production/orders/{order_id}/progress/ — spec #13."""

    serializer_class = ProductionOrderProgressSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_url_kwarg = "order_id"

    def get_queryset(self):
        return company_scoped_queryset(ProductionOrder.objects.all(), self.request)


class StageAssignmentCreateView(generics.CreateAPIView):
    """POST — admin/manager assigns an employee to a stage on an order (spec #8)."""

    serializer_class = StageAssignmentCreateSerializer
    permission_classes = [IsManagerOrAdmin]

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id, assigned_by=self.request.user)


class CorrectCompletionView(APIView):
    """
    POST /api/production/completions/{completion_id}/correct/

    Admin/manager-only (spec #15). Employees have no path that reaches
    this view at all (permission_classes below), and every correction
    writes an audit row alongside the change — never a silent edit.
    """

    permission_classes = [IsManagerOrAdmin]

    def post(self, request, completion_id):
        completion = get_object_or_404(
            company_scoped_queryset(StageCompletion.objects.all(), request), id=completion_id
        )
        reason = request.data.get("reason", "").strip()
        if not reason:
            raise ValidationError({"reason": "A reason is required to correct a completion record."})

        editable_fields = {"remarks", "location_verified"}
        new_values = {k: v for k, v in request.data.items() if k in editable_fields}
        if not new_values:
            raise ValidationError({"detail": "No editable fields provided."})

        previous_values = {k: getattr(completion, k) for k in new_values}
        for k, v in new_values.items():
            setattr(completion, k, v)
        completion.save(update_fields=list(new_values.keys()))

        StageCompletionCorrection.objects.create(
            completion=completion, corrected_by=request.user, reason=reason,
            previous_values=previous_values, new_values=new_values,
        )
        log_action(
            AuditLog.Action.PRODUCTION_COMPLETION_CORRECTED,
            performed_by=request.user, target_user=completion.employee.user, request=request,
            metadata={"completion_id": completion.id, "reason": reason, "changes": new_values},
        )
        return Response({"detail": "Completion record updated.", "new_values": new_values})
