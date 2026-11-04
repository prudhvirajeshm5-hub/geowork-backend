import math
from datetime import datetime

from django.contrib.gis.geos import Point, Polygon
from django.core.management.base import BaseCommand, CommandError

from employees.models import Employee
from geofence.models import WorkArea
from tracking.models import LocationPing


class Command(BaseCommand):
    help = (
        "Find how far to move a work area (east/north metres) so that an employee's "
        "readings fall inside it. Dry run unless --apply is given."
    )

    def add_arguments(self, parser):
        parser.add_argument("--area-id", type=int, required=True)
        parser.add_argument("--employee-code", required=True)
        parser.add_argument("--date", required=True, help="YYYY-MM-DD")
        parser.add_argument("--range", type=float, default=20.0, help="Search this many metres each way.")
        parser.add_argument("--step", type=float, default=2.0, help="Grid step in metres.")
        parser.add_argument("--apply", action="store_true", help="Actually move the area.")
        parser.add_argument("--dx", type=float, help="Metres to move east (negative = west). Needed with --apply.")
        parser.add_argument("--dy", type=float, help="Metres to move north (negative = south). Needed with --apply.")

    def handle(self, *args, **opt):
        area = WorkArea.objects.filter(pk=opt["area_id"]).first()
        if area is None:
            raise CommandError("No work area with that id.")
        employee = Employee.objects.filter(
            employee_code=opt["employee_code"], company_id=area.company_id
        ).first()
        if employee is None:
            raise CommandError("No employee with that code in this company.")

        day = datetime.strptime(opt["date"], "%Y-%m-%d").date()
        pings = list(
            LocationPing.objects.filter(employee=employee, recorded_at__date=day).order_by("recorded_at")
        )
        if not pings:
            raise CommandError("No location readings for that employee on that day.")

        cos_lat = math.cos(math.radians(area.boundary.centroid.y))
        ring = list(area.boundary.transform(3857, clone=True).coords[0])
        xy = []
        for p in pings:
            m = p.location.transform(3857, clone=True)
            xy.append((m.x, m.y))

        def inside_count(dx_m, dy_m):
            # Web Mercator stretches distances by 1/cos(lat); convert metres to map units.
            dx = dx_m / cos_lat
            dy = dy_m / cos_lat
            shifted = Polygon([(x + dx, y + dy) for x, y in ring], srid=3857)
            return sum(1 for x, y in xy if shifted.covers(Point(x, y, srid=3857)))

        if opt["apply"]:
            if opt["dx"] is None or opt["dy"] is None:
                raise CommandError("--apply needs both --dx and --dy.")
            dx = opt["dx"] / cos_lat
            dy = opt["dy"] / cos_lat
            moved = Polygon([(x + dx, y + dy) for x, y in ring], srid=3857).transform(4326, clone=True)
            area.boundary = moved
            area.save(update_fields=["boundary", "updated_at"])
            after = inside_count(0, 0)
            self.stdout.write(
                f"Moved '{area.name}' by east {opt['dx']} m, north {opt['dy']} m. "
                f"Readings inside now: {after} of {len(xy)}."
            )
            return

        steps = int(round(opt["range"] / opt["step"]))
        candidates = []
        for i in range(-steps, steps + 1):
            for j in range(-steps, steps + 1):
                dx_m, dy_m = i * opt["step"], j * opt["step"]
                candidates.append((inside_count(dx_m, dy_m), -math.hypot(dx_m, dy_m), dx_m, dy_m))

        baseline = inside_count(0, 0)
        candidates.sort(reverse=True)
        self.stdout.write(f"Area '{area.name}', {employee.employee_code}, {day}: {len(xy)} readings.")
        self.stdout.write(f"Inside now (no move): {baseline}")
        self.stdout.write("Best offsets (east m, north m -> readings inside):")
        for count, _, dx_m, dy_m in candidates[:5]:
            self.stdout.write(f"  east {dx_m:+.0f} m, north {dy_m:+.0f} m -> {count}")
        self.stdout.write("Dry run only. Nothing was changed.")
