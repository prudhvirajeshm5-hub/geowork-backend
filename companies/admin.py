from django.contrib import admin

from .models import Branch, Company, Department, Designation, ShiftTiming, WorkingDay


class BranchInline(admin.TabularInline):
    model = Branch
    extra = 0


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "plan", "max_employees", "is_active", "created_at")
    list_filter = ("plan", "is_active")
    search_fields = ("name", "gstin", "contact_email")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [BranchInline]


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "city", "is_active")
    list_filter = ("company", "is_active", "state")
    search_fields = ("name", "code", "city")


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "branch", "is_active")
    list_filter = ("company", "is_active")
    search_fields = ("name",)


@admin.register(Designation)
class DesignationAdmin(admin.ModelAdmin):
    list_display = ("title", "company", "department", "level", "is_active")
    list_filter = ("company", "is_active")
    search_fields = ("title",)


class WorkingDayInline(admin.TabularInline):
    model = WorkingDay
    extra = 0


@admin.register(ShiftTiming)
class ShiftTimingAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "start_time", "end_time", "is_night_shift", "is_active")
    list_filter = ("company", "is_active", "is_night_shift")
    search_fields = ("name",)
    inlines = [WorkingDayInline]


@admin.register(WorkingDay)
class WorkingDayAdmin(admin.ModelAdmin):
    list_display = ("company", "shift", "weekday", "is_working")
    list_filter = ("company", "weekday", "is_working")
