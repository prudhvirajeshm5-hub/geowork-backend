from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import AuditLog, Device, OTP, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("-date_joined",)
    list_display = ("phone", "get_full_name", "email", "role", "company", "is_active", "is_staff")
    list_filter = ("role", "company", "is_active", "is_staff")
    search_fields = ("phone", "email", "first_name", "last_name")
    fieldsets = (
        (None, {"fields": ("phone", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "email")}),
        ("Work", {"fields": ("role", "company")}),
        ("Status", {"fields": ("is_active", "is_phone_verified", "is_staff", "is_superuser")}),
        ("Permissions", {"fields": ("groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("phone", "email", "password1", "password2", "role", "company")}),
    )


@admin.register(OTP)
class OTPAdmin(admin.ModelAdmin):
    list_display = ("phone", "purpose", "is_used", "attempts", "created_at", "expires_at")
    list_filter = ("purpose", "is_used")
    search_fields = ("phone",)
    readonly_fields = ("code", "created_at")


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("user", "device_id", "platform", "is_active", "registered_at", "last_seen_at")
    list_filter = ("platform", "is_active")
    search_fields = ("user__phone", "device_id")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "performed_by", "target_user", "company", "ip_address", "created_at")
    list_filter = ("action", "company")
    search_fields = ("performed_by__phone", "target_user__phone", "ip_address")
    readonly_fields = ("action", "performed_by", "target_user", "company", "ip_address", "metadata", "created_at")

    def has_add_permission(self, request):
        return False
