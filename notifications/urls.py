from rest_framework.routers import DefaultRouter

from . import views

app_name = "notifications"

router = DefaultRouter()
router.register("", views.NotificationViewSet, basename="notification")

urlpatterns = router.urls
