from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin

from .models import EmployeeLiveStatus, LocationPing


@admin.register(EmployeeLiveStatus)
class EmployeeLiveStatusAdmin(GISModelAdmin):
    list_display = ("employee", "company", "branch", "current_work_area", "last_ping_at", "is_online", "connectivity_status")
    list_filter = ("company", "branch", "gps_enabled", "network_connected")
    search_fields = ("employee__employee_code", "employee__user__first_name", "employee__user__last_name")
    readonly_fields = ("updated_at",)
    default_lon = 73.8567
    default_lat = 18.5204
    default_zoom = 11

    @admin.display(boolean=True)
    def is_online(self, obj):
        return obj.is_online

    def connectivity_status(self, obj):
        return obj.connectivity_status


@admin.register(LocationPing)
class LocationPingAdmin(GISModelAdmin):
    list_display = ("employee", "work_area", "recorded_at", "gps_enabled", "network_connected")
    list_filter = ("company", "work_area", "gps_enabled", "network_connected")
    search_fields = ("employee__employee_code",)
    date_hierarchy = "recorded_at"
    default_lon = 73.8567
    default_lat = 18.5204
    default_zoom = 11
