import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("geofence", "0001_initial"),
        ("tracking", "0002_alter_employeelivestatus_options"),
    ]

    operations = [
        migrations.AddField(
            model_name="employeelivestatus",
            name="candidate_work_area",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="employees_pending_here",
                to="geofence.workarea",
            ),
        ),
        migrations.AddField(
            model_name="employeelivestatus",
            name="candidate_since",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
