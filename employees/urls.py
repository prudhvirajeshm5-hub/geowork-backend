from rest_framework.routers import DefaultRouter

from . import views

app_name = "employees"

router = DefaultRouter()
router.register("transfers", views.EmployeeTransferViewSet, basename="employee-transfer")
router.register("", views.EmployeeViewSet, basename="employee")

urlpatterns = router.urls