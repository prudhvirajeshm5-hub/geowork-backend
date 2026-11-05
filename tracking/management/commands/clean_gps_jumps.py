from datetime import datetime, time, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from tracking.models import LocationPing
from tracking.services import _should_reject_fix


class _Track:
    """Minimal stand-in for EmployeeLiveStatus, holding the last accepted fix."""

    def __init__(self):
        self.last_location = None
        self.last_ping_at = None


class Command(BaseCommand):
    help = "Deletes stored GPS points that imply impossible jumps, for one day."

    def add_arguments(self, parser):
        parser.add_argument("--date", required=True, help="Day to clean, YYYY-MM-DD")
        parser.add_argument("--dry-run", action="store_true", help="Only report, delete nothing")

    def handle(self, *args, **options):
        day = datetime.strptime(options["date"], "%Y-%m-%d").date()
        tz = timezone.get_current_timezone()
        start = timezone.make_aware(datetime.combine(day, time.min), tz)
        end = start + timedelta(days=1)

        pings = (
            LocationPing.objects.filter(recorded_at__gte=start, recorded_at__lt=end)
            .order_by("employee_id", "recorded_at")
        )

        tracks = {}
        bad_ids = []
        for ping in pings.iterator():
            track = tracks.setdefault(ping.employee_id, _Track())
            lat, lng = ping.location.y, ping.location.x
            if _should_reject_fix(track, lat, lng, ping.accuracy_meters, ping.recorded_at):
                bad_ids.append(ping.id)
                continue
            track.last_location = ping.location
            track.last_ping_at = ping.recorded_at

        self.stdout.write(f"{len(bad_ids)} implausible point(s) found on {day}")
        if options["dry_run"] or not bad_ids:
            self.stdout.write("Dry run: nothing deleted." if options["dry_run"] else "Nothing to delete.")
            return
        deleted, _ = LocationPing.objects.filter(id__in=bad_ids).delete()
        self.stdout.write(f"Deleted {deleted} row(s).")
