from django.db import models

from companies.models import Company
from employees.models import Employee


class Complaint(models.Model):
    class Category(models.TextChoices):
        WORKPLACE = "WORKPLACE", "Workplace Issue"
        EQUIPMENT = "EQUIPMENT", "Equipment"
        COLLEAGUE = "COLLEAGUE", "Colleague"
        OTHER = "OTHER", "Other"

    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        RESOLVED = "RESOLVED", "Resolved"

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="complaints")
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="complaints")
    category = models.CharField(max_length=20, choices=Category.choices)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    subject = models.CharField(max_length=150)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    resolution_note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
