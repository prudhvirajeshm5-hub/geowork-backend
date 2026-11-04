from rest_framework import serializers

from .models import ProductionOrder, ProductionStage, StageAssignment, StageCompletion


class ProductionStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductionStage
        fields = (
            "id", "name", "description", "sequence", "department", "is_active",
            "location_verification_required", "photo_required", "remarks_required",
        )
        read_only_fields = ("id",)


class StageCompletionSerializer(serializers.ModelSerializer):
    completed_by_name = serializers.CharField(source="employee.user.get_full_name", read_only=True)

    class Meta:
        model = StageCompletion
        fields = (
            "id", "completed_at", "completed_by_name", "latitude", "longitude",
            "location_verified", "work_area", "remarks", "photo",
        )
        read_only_fields = fields


class MyTaskSerializer(serializers.ModelSerializer):
    """One row of an employee's "My Production" list (spec #1)."""

    order_reference = serializers.CharField(source="order.order_reference", read_only=True)
    vehicle_reference = serializers.CharField(source="order.vehicle_reference", read_only=True)
    stage_name = serializers.CharField(source="stage.name", read_only=True)
    stage_sequence = serializers.IntegerField(source="stage.sequence", read_only=True)
    location_verification_required = serializers.BooleanField(source="stage.location_verification_required", read_only=True)
    photo_required = serializers.BooleanField(source="stage.photo_required", read_only=True)
    remarks_required = serializers.BooleanField(source="stage.remarks_required", read_only=True)
    status = serializers.CharField(read_only=True)
    completion = StageCompletionSerializer(read_only=True)

    class Meta:
        model = StageAssignment
        fields = (
            "id", "order", "order_reference", "vehicle_reference", "stage", "stage_name", "stage_sequence",
            "location_verification_required", "photo_required", "remarks_required",
            "status", "completion", "assigned_at",
        )
        read_only_fields = fields


class CompleteStageSerializer(serializers.Serializer):
    """
    Input for POST /api/production/stages/{assignment_id}/complete/.

    Deliberately does NOT accept employee_id, company_id, or order_id —
    those come only from the authenticated request/assignment (spec #17:
    never trust a client-supplied identity field).
    """

    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, default="")
    photo = serializers.ImageField(required=False, allow_null=True)
    device_id = serializers.CharField(required=False, allow_blank=True, default="")
    # Client-generated (e.g. a UUID created once when the button is first
    # pressed, reused on any offline-queue retry of the same tap) — see
    # StageCompletion.idempotency_key.
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")
    # The device's own clock, kept only as a diagnostic — never authoritative.
    device_reported_at = serializers.DateTimeField(required=False, allow_null=True)


class ProductionOrderProgressSerializer(serializers.ModelSerializer):
    total_stages = serializers.IntegerField(read_only=True)
    completed_stages = serializers.IntegerField(read_only=True)
    progress_percent = serializers.IntegerField(read_only=True)
    stages = serializers.SerializerMethodField()

    class Meta:
        model = ProductionOrder
        fields = (
            "id", "order_reference", "vehicle_reference", "total_stages",
            "completed_stages", "progress_percent", "stages",
        )
        read_only_fields = fields

    def get_stages(self, obj):
        assignments = obj.assignments.select_related("stage", "employee__user", "completion").order_by("stage__sequence")
        return [
            {
                "stage_name": a.stage.name,
                "sequence": a.stage.sequence,
                "employee_name": a.employee.user.get_full_name(),
                "status": a.status,
                "completed_at": a.completion.completed_at if hasattr(a, "completion") else None,
            }
            for a in assignments
        ]


class StageAssignmentCreateSerializer(serializers.ModelSerializer):
    """Admin/manager assigning an employee to a stage on an order (spec #8)."""

    class Meta:
        model = StageAssignment
        fields = ("id", "order", "stage", "employee")
        read_only_fields = ("id",)

    def validate(self, attrs):
        request = self.context["request"]
        company_id = request.user.company_id
        # Cross-object ownership checks (spec #17) — every referenced
        # object must belong to the same company as the requesting admin,
        # not just exist somewhere in the database.
        for field, obj in (("order", attrs["order"]), ("stage", attrs["stage"]), ("employee", attrs["employee"])):
            if obj.company_id != company_id:
                raise serializers.ValidationError({field: "Does not belong to your company."})
        return attrs
