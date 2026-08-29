from rest_framework.routers import DefaultRouter

from . import views

app_name = "companies"

router = DefaultRouter()
router.register("companies", views.CompanyViewSet, basename="company")
router.register("branches", views.BranchViewSet, basename="branch")
router.register("departments", views.DepartmentViewSet, basename="department")
router.register("designations", views.DesignationViewSet, basename="designation")
router.register("shifts", views.ShiftTimingViewSet, basename="shift")
router.register("working-days", views.WorkingDayViewSet, basename="working-day")

urlpatterns = router.urls
