from django.urls import path

from . import views

urlpatterns = [
    path("", views.ComplaintListCreateView.as_view(), name="complaint-list"),
    path("company/", views.CompanyComplaintsView.as_view(), name="complaint-company"),
    path("<int:pk>/", views.ComplaintUpdateView.as_view(), name="complaint-update"),
]
