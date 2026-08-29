from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "tracking"

router = DefaultRouter()
router.register("live", views.LiveDashboardViewSet, basename="live-status")
router.register("pings", views.LocationPingHistoryViewSet, basename="location-ping")

urlpatterns = [
    path("ping/", views.PingView.as_view(), name="ping"),
] + router.urls
