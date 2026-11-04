from datetime import datetime, time, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from attendance.models import AttendanceRecord, OutsideEvent
from employees.models import Employee
from geofence.services import find_containing_work_area_with_tolerance
from tracking.models import LocationPing


class Command(BaseCommand):
    help = "Show, or with --save store, the periods an employee was outside their work area."

    def add_arguments(self, parser):
        parser.add_argument("--employee-id", type=int, required=True)
        parser.add_argument("--date", required=True, help="YYYY-MM-DD")
        parser.add_argument("--save", action="store_true", help="Store the periods on the attendance record.")

    def handle(self, *args, **options):
        try:
            employee = Employee.objects.get(pk=options["employee_id"])
        except Employee.DoesNotExist:
            raise CommandError("No employee with that id.")
        day = datetime.strptime(options["date"], "%Y-%m-%d").date()
        record = AttendanceRecord.objects.filter(employee=employee, date=day).first()

        start = timezone.make_aware(datetime.combine(day, time.min))
        end = start + timedelta(days=1)
        if record is not None and record.check_in_time is not None:
            start = record.check_in_time
            if record.check_out_time is not None:
                end = record.check_out_time + timedelta(seconds=1)

        pings = LocationPing.objects.filter(
            employee=employee, recorded_at__gte=start, recorded_at__lt=end
        ).order_by("recorded_at")
        if not pings.exists():
            self.stdout.write("No location history in that window.")
            return

        intervals, outside_since, last_seen = [], None, None
        for ping in pings:
            area = find_containing_work_area_with_tolerance(
                employee.company_id,
                ping.location.y,
                ping.location.x,
                accuracy_meters=ping.accuracy_meters,
                branch_id=employee.branch_id,
            )
            if area is None and outside_since is None:
                outside_since = ping.recorded_at
            elif area is not None and outside_since is not None:
                intervals.append((outside_since, ping.recorded_at))
                outside_since = None
            last_seen = ping.recorded_at
        if outside_since is not None:
            intervals.append((outside_since, last_seen))

        if not intervals:
            self.stdout.write("Inside the work area for every stored location in that window.")
            return

        total = 0
        self.stdout.write(f"Outside the work area on {day}:")
        for left, back in intervals:
            minutes = int((back - left).total_seconds() // 60)
            total += minutes
            self.stdout.write(
                f"  left {timezone.localtime(left):%H:%M:%S}  back {timezone.localtime(back):%H:%M:%S}  ({minutes} min)"
            )
        self.stdout.write(f"Total outside: {total} min in {len(intervals)} period(s).")

        if options["save"]:
            if record is None:
                self.stdout.write("No attendance record for that date, so nothing was saved.")
                return
            if record.outside_events.exists():
                self.stdout.write("This record already has outside periods, so nothing was saved.")
                return
            for left, back in intervals:
                OutsideEvent.objects.create(
                    record=record,
                    left_at=left,
                    returned_at=back,
                    minutes=int((back - left).total_seconds() // 60),
                )
            record.outside_minutes = (record.outside_minutes or 0) + total
            record.save(update_fields=["outside_minutes"])
            self.stdout.write("Saved to the attendance record.")
