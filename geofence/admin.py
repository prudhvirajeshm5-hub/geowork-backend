from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin

from .models import WorkArea, WorkAreaAuditLog


@admin.register(WorkArea)
class WorkAreaAdmin(GISModelAdmin):
    list_display = ("name", "company", "branch", "shape_type", "category", "color", "is_active", "updated_at")
    list_filter = ("company", "branch", "shape_type", "category", "is_active")
    search_fields = ("name",)
    readonly_fields = ("created_at", "updated_at")
    default_lon = 73.8567  # Pune, as a sensible default map center for this deployment
    default_lat = 18.5204
    default_zoom = 12


@admin.register(WorkAreaAuditLog)
class WorkAreaAuditLogAdmin(admin.ModelAdmin):
    list_display = ("work_area_name", "company", "action", "performed_by", "performed_at")
    list_filter = ("company", "action")
    search_fields = ("work_area_name",)
    readonly_fields = ("work_area", "company", "work_area_name", "action", "performed_by", "performed_at", "snapshot")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
