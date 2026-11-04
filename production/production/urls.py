from django.urls import path

from . import views

app_name = "production"

urlpatterns = [
    path("stages/", views.ProductionStageListView.as_view(), name="stage-list"),
    path("my-tasks/", views.MyTasksView.as_view(), name="my-tasks"),
    path("my-history/", views.MyHistoryView.as_view(), name="my-history"),
    path("stages/<int:assignment_id>/complete/", views.CompleteStageView.as_view(), name="complete-stage"),
    path("orders/<int:order_id>/progress/", views.OrderProgressView.as_view(), name="order-progress"),
    path("assignments/", views.StageAssignmentCreateView.as_view(), name="assignment-create"),
    path("completions/<int:completion_id>/correct/", views.CorrectCompletionView.as_view(), name="completion-correct"),
]
