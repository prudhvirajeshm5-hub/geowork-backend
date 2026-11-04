from django.contrib import admin

from .models import FaqItem, Holiday, Policy

admin.site.register(Policy)
admin.site.register(Holiday)
admin.site.register(FaqItem)
