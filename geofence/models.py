"""
Module 4 - Interactive Geofence Builder.

Every shape the admin draws (polygon, circle, rectangle) is normalized down
to a `Polygon` in `boundary` so containment checks (Module 5 attendance,
Module 6 live tracking) are a single uniform spatial query regardless of how
the area was originally drawn:

    WorkArea.objects.filter(company=company, is_active=True, boundary__contains=point)

Circles additionally keep their `center_point` + `radius_meters` so the
admin's map editor can re-render an exact circle instead of the polygon
approximation used for the containment math.
"""
from django.conf import settings
from django.contrib.gis.db import models as gis_models
from django.contrib.gis.geos import Point
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models

from companies.models import Branch, Company

hex_color_validator = RegexValidator(
    regex=r"^#(?:[0-9a-fA-F]{3}){1,2}$",
    message="Color must be a hex code, e.g. #FF5733",
)

# Number of straight-line segments used to approximate a circle as a polygon.
# 48 segments keeps the area error well under 1% for any geofence-sized circle.
CIRCLE_APPROXIMATION_SEGMENTS = 48


class WorkAreaCategory(models.TextChoices):
    FACTORY = "FACTORY", "Factory"
    WAREHOUSE = "WAREHOUSE", "Warehouse"
    OFFICE = "OFFICE", "Office"
    PARKING = "PARKING", "Parking"
    ASSEMBLY_LINE = "ASSEMBLY_LINE", "Assembly Line"
    BATTERY_ROOM = "BATTERY_ROOM", "Battery Room"
    DISPATCH_AREA = "DISPATCH_AREA", "Dispatch Area"
    CUSTOMER_SITE = "CUSTOMER_SITE", "Customer Site"
    OTHER = "OTHER", "Other"


class ShapeType(models.TextChoices):
    POLYGON = "POLYGON", "Polygon"
    CIRCLE = "CIRCLE", "Circle"
    RECTANGLE = "RECTANGLE", "Rectangle"


class WorkArea(models.Model):
    """A named, colored, drawable work-area boundary belonging to a branch."""

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="work_areas")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="work_areas")

    name = models.CharField(max_length=150)
    category = models.CharField(max_length=20, choices=WorkAreaCategory.choices, default=WorkAreaCategory.OTHER)
    color = models.CharField(max_length=7, default="#2E86DE", validators=[hex_color_validator])

    shape_type = models.CharField(max_length=10, choices=ShapeType.choices)
    # Always populated regardless of shape_type — this is what containment
    # queries run against. SRID 4326 = WGS84 lat/lng, the GPS standard.
    boundary = gis_models.PolygonField(srid=4326, spatial_index=True)

    # Only populated when shape_type == CIRCLE, to preserve exact geometry
    # for re-editing (boundary itself is only a polygon approximation).
    center_point = gis_models.PointField(srid=4326, null=True, blank=True)
    radius_meters = models.FloatField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="work_areas_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("branch", "name")
        indexes = [models.Index(fields=["company", "branch", "is_active"])]
        ordering = ["branch", "name"]

    def __str__(self):
        return f"{self.name} ({self.branch.name})"

    def clean(self):
        if self.shape_type == ShapeType.CIRCLE and (self.center_point is None or self.radius_meters is None):
            raise ValidationError("Circle work areas require center_point and radius_meters.")
        if self.boundary and not self.boundary.valid:
            raise ValidationError(f"Boundary geometry is invalid: {self.boundary.valid_reason}")
        if self.branch_id and self.company_id and self.branch.company_id != self.company_id:
            raise ValidationError("branch must belong to the same company as the work area.")

    def contains_point(self, latitude, longitude):
        """
        In-process check for a single already-fetched WorkArea (e.g. in the
        admin or a test). Bulk lookups should use
        `geofence.services.find_containing_work_area`, which runs `covers`
        as a database query instead of fetching+testing in Python.
        `covers` (not `contains`) so a point exactly on the boundary line
        still counts as inside.
        """
        point = Point(float(longitude), float(latitude), srid=4326)
        return self.boundary.covers(point)


class WorkAreaAuditLog(models.Model):
    """
    Lightweight audit trail for boundary edits/deletes, per the platform-wide
    'Audit Logs' security requirement — geofences directly control attendance
    and payroll outcomes, so changes need a record of who/when/what changed.
    """

    class Action(models.TextChoices):
        CREATED = "CREATED", "Created"
        UPDATED = "UPDATED", "Updated"
        DELETED = "DELETED", "Deleted"

    work_area = models.ForeignKey(
        WorkArea, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs"
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="work_area_audit_logs")
    work_area_name = models.CharField(max_length=150, help_text="Snapshot in case the WorkArea is later deleted")
    action = models.CharField(max_length=10, choices=Action.choices)
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    performed_at = models.DateTimeField(auto_now_add=True)
    snapshot = models.JSONField(default=dict, blank=True, help_text="Boundary/shape state at the time of the action")

    class Meta:
        ordering = ["-performed_at"]

    def __str__(self):
        return f"{self.action} {self.work_area_name} by {self.performed_by}"
