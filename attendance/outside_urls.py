from django.urls import path

from . import outside_api

urlpatterns = [
    path("me/", outside_api.MyOutsideView.as_view(), name="my-outside"),
    path("company/", outside_api.CompanyOutsideView.as_view(), name="company-outside"),
]
