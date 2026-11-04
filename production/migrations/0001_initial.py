import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("companies", "0001_initial"),
        ("employees", "0001_initial"),
        ("geofence", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ProductionStage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("description", models.TextField(blank=True)),
                ("sequence", models.PositiveIntegerField(help_text="Display/workflow order, lower first")),
                ("is_active", models.BooleanField(default=True)),
                ("location_verification_required", models.BooleanField(default=False)),
                ("photo_required", models.BooleanField(default=False)),
                ("remarks_required", models.BooleanField(default=False)),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="production_stages", to="companies.company")),
                ("department", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="production_stages", to="companies.department")),
            ],
            options={"ordering": ["sequence", "id"], "unique_together": {("company", "name")}},
        ),
        migrations.CreateModel(
            name="ProductionOrder",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("order_reference", models.CharField(help_text="e.g. PRD-2026-00125", max_length=60)),
                ("vehicle_reference", models.CharField(help_text="e.g. M5EV00125 — vehicle/product/serial number", max_length=60)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("branch", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="companies.branch")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="production_orders", to="companies.company")),
            ],
            options={"unique_together": {("company", "order_reference")}},
        ),
        migrations.AddIndex(
            model_name="productionorder",
            index=models.Index(fields=["company", "vehicle_reference"], name="production__company_vehicle_idx"),
        ),
        migrations.CreateModel(
            name="StageAssignment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("assigned_at", models.DateTimeField(auto_now_add=True)),
                ("assigned_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="stage_assignments_made", to=settings.AUTH_USER_MODEL)),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="stage_assignments", to="companies.company")),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="stage_assignments", to="employees.employee")),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="assignments", to="production.productionorder")),
                ("stage", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="assignments", to="production.productionstage")),
            ],
            options={"unique_together": {("order", "stage")}},
        ),
        migrations.AddIndex(
            model_name="stageassignment",
            index=models.Index(fields=["employee", "-assigned_at"], name="production__employee_assigned_idx"),
        ),
        migrations.CreateModel(
            name="StageCompletion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("idempotency_key", models.CharField(blank=True, max_length=64, null=True, unique=True)),
                ("completed_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("device_reported_at", models.DateTimeField(blank=True, null=True)),
                ("latitude", models.FloatField(blank=True, null=True)),
                ("longitude", models.FloatField(blank=True, null=True)),
                ("location_verified", models.BooleanField(default=False)),
                ("device_id", models.CharField(blank=True, max_length=120)),
                ("remarks", models.TextField(blank=True)),
                ("photo", models.ImageField(blank=True, null=True, upload_to="production_completions/")),
                ("assignment", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="completion", to="production.stageassignment")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="stage_completions", to="companies.company")),
                ("employee", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="stage_completions", to="employees.employee")),
                ("work_area", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="geofence.workarea")),
            ],
            options={"ordering": ["-completed_at"]},
        ),
        migrations.AddIndex(
            model_name="stagecompletion",
            index=models.Index(fields=["employee", "-completed_at"], name="production__employee_completed_idx"),
        ),
        migrations.AddIndex(
            model_name="stagecompletion",
            index=models.Index(fields=["company", "-completed_at"], name="production__company_completed_idx"),
        ),
        migrations.CreateModel(
            name="StageCompletionCorrection",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reason", models.TextField()),
                ("previous_values", models.JSONField(default=dict)),
                ("new_values", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("completion", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="corrections", to="production.stagecompletion")),
                ("corrected_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
