"""
Employee-transfer workflow: an admin/manager requests moving an employee to
a different branch, the employee's manager (or any admin, if the employee
has no manager) approves or rejects it, and only on approval does the
employee's actual `branch` field change. Mirrors the pattern used in
attendance/services.py — one small function per state transition, called
directly from the view layer.
"""
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import Role
from notifications import services as notification_services

from .models import Employee, EmployeeTransferRequest


def _can_decide(user, transfer):
    """The assigned approver (employee's manager) or any company admin."""
    if user.is_superuser or user.role == Role.ADMIN:
        return True
    approver = transfer.approver
    return bool(approver and approver.user_id == user.id)


def request_transfer(requested_by, employee, to_branch, reason="", effective_date=None):
    if to_branch.company_id != employee.company_id:
        raise ValidationError({"to_branch": "Does not belong to this employee's company."})
    if employee.branch_id == to_branch.id:
        raise ValidationError({"to_branch": "Employee is already at this branch."})
    if employee.transfer_requests.filter(status=EmployeeTransferRequest.Status.PENDING).exists():
        raise ValidationError({"detail": "This employee already has a pending transfer request."})

    transfer = EmployeeTransferRequest.objects.create(
        employee=employee,
        company=employee.company,
        from_branch=employee.branch,
        to_branch=to_branch,
        requested_by=requested_by,
        approver=employee.manager,
        reason=reason,
        effective_date=effective_date,
    )
    notification_services.notify_transfer_requested(transfer)
    return transfer


@transaction.atomic
def approve_transfer(user, transfer, decision_note=""):
    if not _can_decide(user, transfer):
        raise PermissionDenied("Only the employee's manager or a company admin can approve this transfer.")
    if transfer.status != EmployeeTransferRequest.Status.PENDING:
        raise ValidationError({"detail": "This transfer request has already been decided."})

    employee = transfer.employee
    employee.branch = transfer.to_branch
    employee.save(update_fields=["branch", "updated_at"])

    transfer.status = EmployeeTransferRequest.Status.APPROVED
    transfer.decided_by = user
    transfer.decided_at = timezone.now()
    transfer.decision_note = decision_note
    transfer.save(update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"])

    notification_services.notify_transfer_decided(transfer)
    return transfer


def reject_transfer(user, transfer, decision_note=""):
    if not _can_decide(user, transfer):
        raise PermissionDenied("Only the employee's manager or a company admin can reject this transfer.")
    if transfer.status != EmployeeTransferRequest.Status.PENDING:
        raise ValidationError({"detail": "This transfer request has already been decided."})

    transfer.status = EmployeeTransferRequest.Status.REJECTED
    transfer.decided_by = user
    transfer.decided_at = timezone.now()
    transfer.decision_note = decision_note
    transfer.save(update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"])

    notification_services.notify_transfer_decided(transfer)
    return transfer


def cancel_transfer(user, transfer):
    """The original requester or an admin can withdraw a still-pending request."""
    is_requester = transfer.requested_by_id == user.id
    if not (is_requester or user.is_superuser or user.role == Role.ADMIN):
        raise PermissionDenied("Only the requester or a company admin can cancel this transfer.")
    if transfer.status != EmployeeTransferRequest.Status.PENDING:
        raise ValidationError({"detail": "This transfer request has already been decided."})

    transfer.status = EmployeeTransferRequest.Status.CANCELLED
    transfer.decided_by = user
    transfer.decided_at = timezone.now()
    transfer.save(update_fields=["status", "decided_by", "decided_at", "updated_at"])
    return transfer