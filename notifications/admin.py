from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient", "notification_type", "title", "delivery_status", "is_read", "created_at")
    list_filter = ("company", "notification_type", "delivery_status", "is_read")
    search_fields = ("recipient__phone", "recipient__first_name", "recipient__last_name", "title")
    readonly_fields = ("created_at",)
