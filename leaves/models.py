from django.db import models

from companies.models import Company
from employees.models import Employee

# Starting allowances per year. Admin can change them later in the portal.
DEFAULT_LEAVE_TYPES = [
    ("CL", "Casual Leave", 12),
    ("SL", "Sick Leave", 10),
    ("EL", "Earned Leave", 15),
]


class LeaveType(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="leave_types")
    code = models.CharField(max_length=10)
    name = models.CharField(max_length=100)
    annual_allowance = models.PositiveSmallIntegerField(default=0)

    class Meta:
        unique_together = ("company", "code")
        ordering = ["code"]

    def __str__(self):
        return self.name


class LeaveRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="leave_requests")
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="leave_requests")
    leave_type = models.ForeignKey(LeaveType, on_delete=models.PROTECT, related_name="requests")
    from_date = models.DateField()
    to_date = models.DateField()
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    decided_by = models.ForeignKey(
        Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name="leave_decisions"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def days(self):
        return (self.to_date - self.from_date).days + 1
