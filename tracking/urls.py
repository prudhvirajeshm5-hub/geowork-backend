from . import history_views
from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "tracking"

router = DefaultRouter()
router.register("live", views.LiveDashboardViewSet, basename="live-status")
router.register("pings", views.LocationPingHistoryViewSet, basename="location-ping")

urlpatterns = [
    path("my-history/", history_views.MyLocationHistoryView.as_view(), name="my-location-history"),
    path("history/", history_views.AdminLocationHistoryView.as_view(), name="admin-location-history"),
    path("ping/", views.PingView.as_view(), name="ping"),
    path("heartbeat/", views.HeartbeatView.as_view(), name="heartbeat"),
] + router.urls
