from django.urls import path

from . import views

urlpatterns = [
    path("settings/", views.PayrollSettingsView.as_view(), name="payroll-settings"),
    path("monthly/", views.MonthlyPayrollView.as_view(), name="payroll-monthly"),
    path("today/", views.TodayPayrollSummaryView.as_view(), name="payroll-today"),
    path("my-today/", views.MyEarningsTodayView.as_view(), name="payroll-my-today"),
    path("my-month/", views.MyMonthlyPayView.as_view(), name="payroll-my-month"),
]
