from django.contrib import admin

from .models import Employee


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = (
        "employee_code", "user", "company", "branch", "department",
        "designation", "manager", "status", "date_of_joining",
    )
    list_filter = ("company", "status", "branch", "department")
    search_fields = ("employee_code", "user__first_name", "user__last_name", "user__phone")
    autocomplete_fields = ("user", "branch", "department", "designation", "shift", "manager")
