from rest_framework.routers import DefaultRouter

from django.urls import path

from . import views

app_name = "attendance"

router = DefaultRouter()
router.register("records", views.AttendanceRecordViewSet, basename="attendance-record")
router.register("outdoor-duty", views.OutdoorDutyViewSet, basename="outdoor-duty")

urlpatterns = [
    path("start-shift/", views.StartShiftView.as_view(), name="start-shift"),
    path("end-shift/", views.EndShiftView.as_view(), name="end-shift"),
    path("geofence-event/", views.GeofenceEventView.as_view(), name="geofence-event"),
    path("today/", views.TodayAttendanceView.as_view(), name="today"),
] + router.urls