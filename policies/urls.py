from django.urls import path

from . import views

# holidays/ and faq/ come before the slug route so they are not read as policy slugs.
urlpatterns = [
    path("manage/", views.PolicyManageView.as_view(), name="policy-manage"),
    path("manage/<slug:slug>/", views.PolicyManageDetailView.as_view(), name="policy-manage-detail"),
    path("holidays/manage/", views.HolidayManageView.as_view(), name="holiday-manage"),
    path("holidays/manage/<int:pk>/", views.HolidayManageDetailView.as_view(), name="holiday-manage-detail"),
    path("faq/manage/", views.FaqManageView.as_view(), name="faq-manage"),
    path("faq/manage/<int:pk>/", views.FaqManageDetailView.as_view(), name="faq-manage-detail"),
    path("", views.PolicyListView.as_view(), name="policy-list"),
    path("holidays/", views.HolidayListView.as_view(), name="holiday-list"),
    path("faq/", views.FaqListView.as_view(), name="faq-list"),
    path("<slug:slug>/", views.PolicyDetailView.as_view(), name="policy-detail"),
]
