import math

from geofence.services import find_containing_work_area_with_tolerance

from .models import LocationPing

STAY_RADIUS_M = 40      # readings this close to a group's first reading belong to the same place
JUMP_DISTANCE_M = 60    # two readings this far apart within JUMP_WINDOW_S look like GPS drift
JUMP_WINDOW_S = 60
MAX_POINTS = 1000       # readings returned for one day


def metres_between(a, b):
    lat1, lat2 = math.radians(a.y), math.radians(b.y)
    dlat = lat2 - lat1
    dlng = math.radians(b.x - a.x) * math.cos((lat1 + lat2) / 2)
    return math.hypot(dlng, dlat) * 6371000.0


def build_history(employee, day, include_points=False):
    pings = list(
        LocationPing.objects.filter(employee=employee, recorded_at__date=day).order_by("recorded_at")[:MAX_POINTS]
    )
    rows = []
    prev = None
    for ping in pings:
        point = ping.location
        area = find_containing_work_area_with_tolerance(
            employee.company_id,
            point.y,
            point.x,
            accuracy_meters=ping.accuracy_meters or 0,
            branch_id=employee.branch_id,
        )
        jump = bool(
            prev is not None
            and (ping.recorded_at - prev.recorded_at).total_seconds() <= JUMP_WINDOW_S
            and metres_between(prev.location, point) > JUMP_DISTANCE_M
        )
        rows.append({"ping": ping, "point": point, "area": area, "jump": jump})
        prev = ping

    groups = []
    for r in rows:
        area_id = r["area"].id if r["area"] else None
        if groups and groups[-1]["_area_id"] == area_id and metres_between(groups[-1]["_anchor"], r["point"]) <= STAY_RADIUS_M:
            g = groups[-1]
            g["end"] = r["ping"].recorded_at
            g["readings"] += 1
            g["max_accuracy"] = max(g["max_accuracy"], r["ping"].accuracy_meters or 0)
            g["jumps"] += 1 if r["jump"] else 0
        else:
            groups.append({
                "_area_id": area_id,
                "_anchor": r["point"],
                "start": r["ping"].recorded_at,
                "end": r["ping"].recorded_at,
                "area": r["area"].name if r["area"] else None,
                "area_id": area_id,
                "readings": 1,
                "max_accuracy": r["ping"].accuracy_meters or 0,
                "jumps": 1 if r["jump"] else 0,
                "lat": round(r["point"].y, 6),
                "lng": round(r["point"].x, 6),
            })

    segments = []
    for g in groups:
        segments.append({
            "start": g["start"].isoformat(),
            "end": g["end"].isoformat(),
            "area": g["area"],
            "area_id": g["area_id"],
            "readings": g["readings"],
            "max_accuracy": round(float(g["max_accuracy"]), 1),
            "jumps": g["jumps"],
            "lat": g["lat"],
            "lng": g["lng"],
        })

    result = {"date": str(day), "segments": segments, "reading_count": len(rows)}
    if include_points:
        result["points"] = [
            {
                "time": r["ping"].recorded_at.isoformat(),
                "lat": round(r["point"].y, 6),
                "lng": round(r["point"].x, 6),
                "accuracy": round(float(r["ping"].accuracy_meters or 0), 1),
                "area": r["area"].name if r["area"] else None,
                "jump": r["jump"],
            }
            for r in rows
        ]
    return result
