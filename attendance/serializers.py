from rest_framework import serializers

from .models import AttendanceRecord, OutdoorDutyRequest


class CheckPointSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)


class GeofenceEventSerializer(serializers.Serializer):
    event_type = serializers.ChoiceField(choices=["ENTER", "EXIT"])
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)


class AttendanceRecordSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.user.get_full_name", read_only=True)
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    check_in_work_area_name = serializers.CharField(source="check_in_work_area.name", read_only=True, default=None)
    check_out_work_area_name = serializers.CharField(source="check_out_work_area.name", read_only=True, default=None)
    working_hours = serializers.SerializerMethodField()
    is_on_break = serializers.BooleanField(read_only=True)
    current_break_minutes = serializers.IntegerField(read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = (
            "id", "employee", "employee_name", "employee_code", "branch", "shift", "date",
            "check_in_time", "check_in_latitude", "check_in_longitude",
            "check_in_work_area", "check_in_work_area_name", "check_in_source",
            "check_out_time", "check_out_latitude", "check_out_longitude",
            "check_out_work_area", "check_out_work_area_name", "check_out_source",
            "status", "is_late", "late_by_minutes", "is_early_exit", "early_exit_by_minutes",
            "working_minutes", "working_hours", "is_outdoor_duty",
            "total_break_minutes", "is_on_break", "current_break_minutes",
        )
        read_only_fields = fields

    def get_working_hours(self, obj):
        hours, minutes = divmod(obj.working_minutes, 60)
        return f"{hours}h {minutes}m"


class OutdoorDutyRequestSerializer(serializers.ModelSerializer):
    """Read serializer — shown in outdoor-duty history / pending-approval lists."""

    employee_name = serializers.CharField(source="employee.user.get_full_name", read_only=True)
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    requested_by_name = serializers.CharField(source="requested_by.get_full_name", read_only=True, default=None)
    approver_name = serializers.CharField(source="approver.user.get_full_name", read_only=True, default=None)
    decided_by_name = serializers.CharField(source="decided_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = OutdoorDutyRequest
        fields = (
            "id", "employee", "employee_name", "employee_code",
            "start_date", "end_date", "reason",
            "requested_by", "requested_by_name", "approver", "approver_name",
            "status", "decided_by", "decided_by_name", "decided_at", "decision_note",
            "created_at", "updated_at",
        )
        read_only_fields = fields


class OutdoorDutyRequestCreateSerializer(serializers.Serializer):
    # Omit to request for yourself; provide to request on behalf of a
    # direct report (requires manager/admin — enforced in services.py).
    employee = serializers.IntegerField(required=False, allow_null=True, default=None)
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class OutdoorDutyDecisionSerializer(serializers.Serializer):
    decision_note = serializers.CharField(required=False, allow_blank=True, default="")