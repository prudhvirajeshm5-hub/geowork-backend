from django.contrib import admin

from .models import ProductionOrder, ProductionStage, StageAssignment, StageCompletion, StageCompletionCorrection


@admin.register(ProductionStage)
class ProductionStageAdmin(admin.ModelAdmin):
    list_display = ("sequence", "name", "company", "department", "is_active", "location_verification_required")
    list_filter = ("company", "is_active", "location_verification_required")
    search_fields = ("name",)


@admin.register(ProductionOrder)
class ProductionOrderAdmin(admin.ModelAdmin):
    list_display = ("order_reference", "vehicle_reference", "company", "progress_percent", "is_active", "created_at")
    list_filter = ("company", "is_active")
    search_fields = ("order_reference", "vehicle_reference")


@admin.register(StageAssignment)
class StageAssignmentAdmin(admin.ModelAdmin):
    list_display = ("order", "stage", "employee", "status", "assigned_at")
    list_filter = ("company", "stage")
    search_fields = ("order__order_reference", "order__vehicle_reference", "employee__employee_code")


@admin.register(StageCompletion)
class StageCompletionAdmin(admin.ModelAdmin):
    list_display = ("assignment", "employee", "completed_at", "location_verified")
    list_filter = ("company", "location_verified")
    search_fields = ("employee__employee_code", "assignment__order__vehicle_reference")
    readonly_fields = ("assignment", "company", "employee", "completed_at", "idempotency_key")


@admin.register(StageCompletionCorrection)
class StageCompletionCorrectionAdmin(admin.ModelAdmin):
    list_display = ("completion", "corrected_by", "created_at")
    readonly_fields = ("completion", "corrected_by", "reason", "previous_values", "new_values", "created_at")

    def has_add_permission(self, request):
        return False
