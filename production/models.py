"""
Production Stage Completion tracking (new module, additive only — does not
touch attendance, employees, geofence, or auth).

Four models:
- ProductionStage: the reusable, company-configurable stage catalog
  (Chassis Assembly, Wiring, ...). Admin-managed via API, not hardcoded
  into the Flutter app (spec requirement #7).
- ProductionOrder: one vehicle/job/product being built.
- StageAssignment: which employee is responsible for which stage on which
  order. An employee's "My Production" list is just their assignments.
- StageCompletion: the actual completion event an employee records by
  pressing the button. One row per (assignment) at most — enforced by a
  OneToOne, which is the simplest possible duplicate-prevention mechanism
  (spec requirement #5): a second "complete" call has nothing new to
  attach to, so it's rejected at the database level, not just in view logic.
"""
from django.conf import settings
from django.contrib.gis.db import models as gis_models
from django.db import models
from django.utils import timezone

from companies.models import Branch, Company, Department
from employees.models import Employee
from geofence.models import WorkArea


class ProductionStage(models.Model):
    """
    Company-configurable stage catalog (spec #7) — e.g. "Chassis Assembly",
    "Wiring". Not hardcoded in the mobile app; the app renders whatever the
    company has configured, in `sequence` order.
    """

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="production_stages")
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    sequence = models.PositiveIntegerField(help_text="Display/workflow order, lower first")
    department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True, related_name="production_stages"
    )
    is_active = models.BooleanField(default=True)
    location_verification_required = models.BooleanField(
        default=False, help_text="If true, employee must be inside the assigned work area to complete this stage"
    )
    photo_required = models.BooleanField(default=False)
    remarks_required = models.BooleanField(default=False)

    class Meta:
        ordering = ["sequence", "id"]
        unique_together = ("company", "name")

    def __str__(self):
        return f"{self.sequence}. {self.name}"


class ProductionOrder(models.Model):
    """One vehicle/job/product moving through the stage pipeline."""

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="production_orders")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True)
    order_reference = models.CharField(max_length=60, help_text="e.g. PRD-2026-00125")
    vehicle_reference = models.CharField(max_length=60, help_text="e.g. M5EV00125 — vehicle/product/serial number")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("company", "order_reference")
        indexes = [models.Index(fields=["company", "vehicle_reference"])]

    def __str__(self):
        return f"{self.order_reference} ({self.vehicle_reference})"

    @property
    def total_stages(self):
        return self.assignments.count()

    @property
    def completed_stages(self):
        return self.assignments.filter(completion__isnull=False).count()

    @property
    def progress_percent(self):
        total = self.total_stages
        if not total:
            return 0
        return round((self.completed_stages / total) * 100)


class StageAssignment(models.Model):
    """
    Who is responsible for which stage on which order (spec #8/#9). An
    employee's "My Production" / "My Tasks" list (spec #1, #16) is exactly
    their assignments — nothing else needs to model "what an employee can
    see today".
    """

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="stage_assignments")
    order = models.ForeignKey(ProductionOrder, on_delete=models.CASCADE, related_name="assignments")
    stage = models.ForeignKey(ProductionStage, on_delete=models.PROTECT, related_name="assignments")
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="stage_assignments")
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="stage_assignments_made"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # One employee per (order, stage) at a time — reassigning means
        # deleting/replacing this row, not stacking duplicates.
        unique_together = ("order", "stage")
        indexes = [models.Index(fields=["employee", "-assigned_at"])]

    def __str__(self):
        return f"{self.order.vehicle_reference} / {self.stage.name} -> {self.employee.employee_code}"

    @property
    def status(self):
        return "COMPLETED" if hasattr(self, "completion") else "PENDING"


class StageCompletion(models.Model):
    """
    The actual "employee pressed MARK AS COMPLETED" event (spec #2/#3).

    Duplicate prevention (spec #5) is two-layered:
    1. `assignment` is a OneToOneField — the database itself refuses a
       second completion row for the same assignment, independent of
       whatever the view/serializer does.
    2. `idempotency_key` (optional, client-supplied) additionally lets the
       mobile app safely retry an uncertain request (e.g. after a timeout
       or during offline-queue sync, spec #18) without the server needing
       to guess whether the first attempt actually landed.
    """

    assignment = models.OneToOneField(StageAssignment, on_delete=models.CASCADE, related_name="completion")
    # Denormalized alongside `assignment` purely so admin/reporting queries
    # don't have to join through StageAssignment for the common filters.
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="stage_completions")
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="stage_completions")

    idempotency_key = models.CharField(max_length=64, null=True, blank=True, unique=True)

    # Server timestamp is authoritative (spec #3) — `completed_at` is what
    # every report/history view displays. `device_reported_at` is kept
    # alongside it only as a diagnostic (e.g. spotting a device with a
    # badly wrong clock), never used for business logic.
    completed_at = models.DateTimeField(default=timezone.now)
    device_reported_at = models.DateTimeField(null=True, blank=True)

    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    location_verified = models.BooleanField(
        default=False, help_text="True if the stage required location verification and the employee was inside the work area"
    )
    work_area = models.ForeignKey(WorkArea, on_delete=models.SET_NULL, null=True, blank=True)

    device_id = models.CharField(max_length=120, blank=True)
    remarks = models.TextField(blank=True)
    photo = models.ImageField(upload_to="production_completions/", null=True, blank=True)

    class Meta:
        ordering = ["-completed_at"]
        indexes = [models.Index(fields=["employee", "-completed_at"]), models.Index(fields=["company", "-completed_at"])]

    def __str__(self):
        return f"{self.assignment} completed at {self.completed_at:%Y-%m-%d %H:%M}"


class StageCompletionCorrection(models.Model):
    """
    Audit trail for admin/manager corrections to an already-recorded
    completion (spec #15). Employees never get a code path that writes
    here or that can delete a StageCompletion — only views restricted to
    admin/manager permissions create these, alongside whatever field
    change they made on the StageCompletion itself.
    """

    completion = models.ForeignKey(StageCompletion, on_delete=models.CASCADE, related_name="corrections")
    corrected_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    reason = models.TextField()
    previous_values = models.JSONField(default=dict)
    new_values = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
