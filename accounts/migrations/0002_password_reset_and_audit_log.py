import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("companies", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="must_change_password",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="password_changed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="AuditLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("PASSWORD_CHANGED", "Password changed (self-service)"),
                            ("PASSWORD_RESET_REQUESTED", "Password reset requested"),
                            ("PASSWORD_RESET_COMPLETED", "Password reset completed"),
                            ("ADMIN_PASSWORD_RESET_INITIATED", "Admin-initiated password reset"),
                            ("ADMIN_TEMP_PASSWORD_SET", "Admin set a temporary password"),
                            ("LOGOUT_ALL_DEVICES", "Logged out from all devices"),
                            ("EMPLOYEE_DISABLED", "Employee disabled"),
                            ("EMPLOYEE_ENABLED", "Employee enabled"),
                            ("ATTENDANCE_MANUALLY_EDITED", "Attendance record manually edited"),
                            ("GEOFENCE_CREATED", "Geofence created"),
                            ("GEOFENCE_UPDATED", "Geofence updated"),
                            ("GEOFENCE_DELETED", "Geofence deleted"),
                        ],
                        max_length=40,
                    ),
                ),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "company",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="audit_logs",
                        to="companies.company",
                    ),
                ),
                (
                    "performed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="audit_logs_performed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "target_user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="audit_logs_about_me",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="auditlog",
            index=models.Index(fields=["company", "-created_at"], name="accounts_au_company_idx"),
        ),
        migrations.AddIndex(
            model_name="auditlog",
            index=models.Index(fields=["target_user", "-created_at"], name="accounts_au_target__idx"),
        ),
    ]
