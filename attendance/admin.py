from django.contrib import admin

from .models import AttendanceRecord


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = (
        "employee", "date", "status", "check_in_time", "check_out_time",
        "is_late", "is_early_exit", "working_minutes",
    )
    list_filter = ("company", "status", "is_late", "is_early_exit", "date")
    search_fields = ("employee__employee_code", "employee__user__first_name", "employee__user__last_name")
    date_hierarchy = "date"
    readonly_fields = ("created_at", "updated_at")
