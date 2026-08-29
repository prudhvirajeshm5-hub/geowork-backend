from django.core.management.base import BaseCommand
from django.utils.dateparse import parse_date

from attendance.tasks import mark_absentees_for_date


class Command(BaseCommand):
    help = "Mark ACTIVE employees with no attendance record for a date as ABSENT. Defaults to today."

    def add_arguments(self, parser):
        parser.add_argument("--date", type=str, help="YYYY-MM-DD, defaults to today", default=None)

    def handle(self, *args, **options):
        target_date = parse_date(options["date"]) if options["date"] else None
        count = mark_absentees_for_date(target_date)
        self.stdout.write(self.style.SUCCESS(f"Marked {count} employee(s) absent."))
