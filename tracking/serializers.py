from rest_framework import serializers

from .models import EmployeeLiveStatus, LocationPing
from .services import current_shift_status


class PingSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    accuracy_meters = serializers.FloatField(required=False, allow_null=True)
    battery_level = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=100)
    gps_enabled = serializers.BooleanField(required=False, default=True)
    network_connected = serializers.BooleanField(required=False, default=True)
    recorded_at = serializers.DateTimeField(required=False, allow_null=True)


class EmployeeLiveStatusSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.user.get_full_name", read_only=True)
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)
    current_work_area_name = serializers.CharField(source="current_work_area.name", read_only=True, default=None)
    last_latitude = serializers.FloatField(read_only=True)
    last_longitude = serializers.FloatField(read_only=True)
    is_online = serializers.BooleanField(read_only=True)
    connectivity_status = serializers.CharField(read_only=True)
    shift_status = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeLiveStatus
        fields = (
            "employee", "employee_name", "employee_code", "branch", "branch_name",
            "last_latitude", "last_longitude", "last_accuracy_meters", "last_battery_level",
            "gps_enabled", "network_connected", "last_ping_at", "is_online", "connectivity_status",
            "current_work_area", "current_work_area_name", "shift_status", "updated_at",
        )
        read_only_fields = fields

    def get_shift_status(self, obj):
        return current_shift_status(obj.employee)


class LocationPingSerializer(serializers.ModelSerializer):
    latitude = serializers.FloatField(read_only=True)
    longitude = serializers.FloatField(read_only=True)
    work_area_name = serializers.CharField(source="work_area.name", read_only=True, default=None)

    class Meta:
        model = LocationPing
        fields = (
            "id", "employee", "latitude", "longitude", "accuracy_meters", "battery_level",
            "gps_enabled", "network_connected", "work_area", "work_area_name",
            "recorded_at", "received_at",
        )
        read_only_fields = fields
