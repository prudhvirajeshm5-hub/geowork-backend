from django.urls import path
from rest_framework.routers import DefaultRouter

from .self_service import MyEmployeeProfileView, MyPhotoView

from . import views

app_name = "employees"

router = DefaultRouter()
router.register("transfers", views.EmployeeTransferViewSet, basename="employee-transfer")
router.register("", views.EmployeeViewSet, basename="employee")

urlpatterns = [
    path("me/", MyEmployeeProfileView.as_view(), name="my-profile"),
    path("me/photo/", MyPhotoView.as_view(), name="my-photo"),
] + router.urls