from rest_framework import serializers

from .models import Branch, Company, Department, Designation, ShiftTiming, WorkingDay


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = (
            "id", "name", "slug", "logo", "registered_address", "gstin",
            "contact_email", "contact_phone", "timezone", "plan",
            "max_employees", "is_active", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class BranchSerializer(serializers.ModelSerializer):
    code = serializers.CharField(
        max_length=20, required=False, allow_blank=True, allow_null=True
    )

    class Meta:
        model = Branch
        fields = (
            "id", "company", "name", "code", "address", "city", "state",
            "country", "latitude", "longitude", "is_active", "created_at",
        )
        read_only_fields = ("id", "company", "created_at")

    def validate_code(self, value):
        # Normalize blank submissions to None so multiple branches per
        # company can omit a code without violating the (company, code)
        # unique constraint — Postgres treats NULLs as distinct, but two
        # empty strings "" are still considered duplicates.
        return value or None


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ("id", "company", "branch", "name", "description", "is_active")
        read_only_fields = ("id", "company")


class DesignationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Designation
        fields = ("id", "company", "department", "title", "level", "is_active")
        read_only_fields = ("id", "company")


class WorkingDaySerializer(serializers.ModelSerializer):
    weekday_display = serializers.CharField(source="get_weekday_display", read_only=True)

    class Meta:
        model = WorkingDay
        fields = ("id", "company", "shift", "weekday", "weekday_display", "is_working")
        read_only_fields = ("id", "company")


class ShiftTimingSerializer(serializers.ModelSerializer):
    working_days = WorkingDaySerializer(many=True, read_only=True)

    class Meta:
        model = ShiftTiming
        fields = (
            "id", "company", "branch", "name", "start_time", "end_time",
            "is_night_shift", "grace_period_minutes", "half_day_after_minutes",
            "full_day_minutes", "is_active", "working_days",
        )
        read_only_fields = ("id", "company")

    def validate(self, attrs):
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        is_night = attrs.get("is_night_shift", getattr(self.instance, "is_night_shift", False))
        if start and end and start == end:
            raise serializers.ValidationError("start_time and end_time cannot be identical.")
        if start and end and end < start and not is_night:
            raise serializers.ValidationError(
                "end_time is before start_time; set is_night_shift=true for overnight shifts."
            )
        return attrs