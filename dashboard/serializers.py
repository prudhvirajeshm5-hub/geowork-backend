from rest_framework import serializers


class DashboardSummarySerializer(serializers.Serializer):
    date = serializers.DateField()
    branch = serializers.IntegerField(allow_null=True)
    total_employees = serializers.IntegerField()
    present = serializers.IntegerField()
    absent = serializers.IntegerField()
    half_day = serializers.IntegerField()
    late = serializers.IntegerField()
    working = serializers.IntegerField(help_text="Currently checked in, not yet checked out (live, not date-scoped)")
    outside_work_area = serializers.IntegerField(
        help_text="Currently working but the last location ping fell outside every active work area"
    )
    gps_disabled = serializers.IntegerField(help_text="Last reported ping had GPS disabled (live, not date-scoped)")
    jobs_completed = serializers.IntegerField(allow_null=True)
    pending_jobs = serializers.IntegerField(allow_null=True)
    jobs_module_available = serializers.BooleanField(
        help_text="False until V2.0 Job Management ships — jobs_completed/pending_jobs are null until then"
    )
