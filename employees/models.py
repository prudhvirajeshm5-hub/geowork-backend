from django.conf import settings
from django.db import models

from companies.models import Branch, Company, Department, Designation, ShiftTiming


def employee_photo_path(instance, filename):
    return f"companies/{instance.company_id}/employees/{instance.employee_code}/{filename}"


class Employee(models.Model):
    """
    Extends the auth User with organizational, employment, and HR profile
    data. Kept as a separate model (rather than bloating User) so that
    account/auth concerns and workforce-profile concerns evolve independently.
    """

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        DISABLED = "DISABLED", "Disabled"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="employee_profile")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="employees")
    employee_code = models.CharField(max_length=30, help_text="Company-assigned employee ID")

    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="employees")
    department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True, related_name="employees"
    )
    designation = models.ForeignKey(
        Designation, on_delete=models.SET_NULL, null=True, blank=True, related_name="employees"
    )
    shift = models.ForeignKey(ShiftTiming, on_delete=models.SET_NULL, null=True, blank=True, related_name="employees")
    manager = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="direct_reports"
    )

    photo = models.ImageField(upload_to=employee_photo_path, null=True, blank=True)
    date_of_joining = models.DateField(null=True, blank=True)
    date_of_exit = models.DateField(null=True, blank=True)
    address = models.TextField(blank=True)
    emergency_contact_name = models.CharField(max_length=150, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("company", "employee_code")
        indexes = [
            models.Index(fields=["company", "status"]),
            models.Index(fields=["company", "branch"]),
            models.Index(fields=["manager"]),
        ]
        ordering = ["employee_code"]

    def __str__(self):
        return f"{self.employee_code} - {self.user.get_full_name()}"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.manager_id and self.manager_id == self.id:
            raise ValidationError("An employee cannot be their own manager.")

    def disable(self):
        self.status = self.Status.DISABLED
        self.save(update_fields=["status", "updated_at"])
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

    def enable(self):
        self.status = self.Status.ACTIVE
        self.save(update_fields=["status", "updated_at"])
        self.user.is_active = True
        self.user.save(update_fields=["is_active"])


class EmployeeTransferRequest(models.Model):
    """
    A request to move an employee to a different branch/location. Requires
    the employee's manager (or an admin, if no manager is assigned) to
    approve before the employee's branch actually changes. See
    employees/services.py for the request/approve/reject/cancel flow.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="transfer_requests")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="employee_transfer_requests")

    from_branch = models.ForeignKey(
        Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="transfers_out"
    )
    to_branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="transfers_in")

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="transfer_requests_made"
    )
    # The manager expected to decide this request. Null means "no manager
    # assigned" — in that case any company admin may decide it.
    approver = models.ForeignKey(
        Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name="transfer_requests_to_approve"
    )

    reason = models.TextField(blank=True)
    effective_date = models.DateField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="transfer_requests_decided"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "status"]),
            models.Index(fields=["employee", "status"]),
        ]

    def __str__(self):
        return f"{self.employee.employee_code}: {self.from_branch} -> {self.to_branch} ({self.status})"
