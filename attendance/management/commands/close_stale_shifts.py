from django.conf import settings
from django.core.management.base import BaseCommand

from attendance.services import auto_close_stale_shifts


class Command(BaseCommand):
    help = "Close shifts left open longer than LIVE_TRACKING_MAX_SHIFT_HOURS."

    def handle(self, *args, **options):
        max_hours = getattr(settings, "LIVE_TRACKING_MAX_SHIFT_HOURS", 12)
        count = auto_close_stale_shifts(max_hours)
        self.stdout.write(self.style.SUCCESS(f"Closed {count} stale shift(s)."))
