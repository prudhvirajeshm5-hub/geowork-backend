from rest_framework.routers import DefaultRouter

from . import views

app_name = "geofence"

router = DefaultRouter()
router.register("work-areas", views.WorkAreaViewSet, basename="work-area")

urlpatterns = router.urls
