from django.urls import path

from . import views

app_name = "reports"

urlpatterns = [
    path("daily-attendance/", views.DailyAttendanceReportView.as_view(), name="daily-attendance"),
    path("monthly-attendance/", views.MonthlyAttendanceReportView.as_view(), name="monthly-attendance"),
    path("working-hours/", views.WorkingHoursReportView.as_view(), name="working-hours"),
    path("late/", views.LateReportView.as_view(), name="late"),
    path("overtime/", views.OvertimeReportView.as_view(), name="overtime"),
    path("attendance-percentage/", views.AttendancePercentageReportView.as_view(), name="attendance-percentage"),
]
