from django.urls import path

from . import views

urlpatterns = [
    path("all/", views.LeaveAdminListView.as_view(), name="leave-all"),
    path("types/", views.LeaveTypesView.as_view(), name="leave-types"),
    path("balance/", views.LeaveBalanceView.as_view(), name="leave-balance"),
    path("", views.LeaveListCreateView.as_view(), name="leave-list"),
    path("pending/", views.LeavePendingView.as_view(), name="leave-pending"),
    path("<int:pk>/cancel/", views.LeaveCancelView.as_view(), name="leave-cancel"),
    path("<int:pk>/decide/", views.LeaveDecideView.as_view(), name="leave-decide"),
]
