from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from .console_view import serve_console

urlpatterns = [
    path("admin/", admin.site.urls),
    path("console/", serve_console, name="ops-console"),
    path("api/v1/auth/", include("accounts.urls")),
    path("api/v1/company/", include("companies.urls")),
    path("api/v1/employees/", include("employees.urls")),
    path("api/v1/geofence/", include("geofence.urls")),
    path("api/v1/attendance/", include("attendance.urls")),
    path("api/v1/tracking/", include("tracking.urls")),
    path("api/v1/dashboard/", include("dashboard.urls")),
    path("api/v1/notifications/", include("notifications.urls")),
    path("api/v1/reports/", include("reports.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)