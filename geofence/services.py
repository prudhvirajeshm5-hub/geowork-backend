"""
Shared spatial lookups used by any module that needs to answer "which work
area is this point inside?" — currently Attendance (Module 5) and Live
Tracking (Module 6). Keeping this in one place means both modules always
agree on containment rules as Module 4's geofence logic evolves (e.g. when
V3's nested/multi-level geofencing lands).
"""
from django.contrib.gis.geos import Point

from .models import WorkArea


def find_containing_work_area(company_id, latitude, longitude, branch_id=None):
    """
    Returns the first active WorkArea (scoped to company, optionally branch)
    whose boundary contains (latitude, longitude), or None.

    V1.1: this used to fetch every active WorkArea for the company/branch
    and test each one in Python via GEOS `.contains()`. Two problems with
    that, fixed here:

    1. Performance (requirement #10) — it never used the GiST spatial index
       already declared on `boundary` (`spatial_index=True`), so it did a
       full table scan + N in-process geometry tests on every single GPS
       ping. `boundary__covers=point` pushes the test into PostgreSQL/PostGIS
       as `ST_Covers`, which the planner can satisfy with the spatial index
       — this stays fast whether there are 10 work areas or 10,000 pings/min
       across thousands of employees.
    2. Boundary-inclusive containment (requirement #9) — GEOS `.contains()`
       is a strict interior test: a point sitting exactly ON the boundary
       line is NOT contained, so an employee standing right at the gate
       could be wrongly treated as outside. `covers` (`ST_Covers`) is the
       inclusive version: interior OR boundary both count. This is the one
       query both Attendance (Module 5) and Live Tracking (Module 6) share,
       so the fix applies everywhere containment is checked.
    """
    point = Point(float(longitude), float(latitude), srid=4326)
    qs = WorkArea.objects.filter(company_id=company_id, is_active=True, boundary__covers=point)
    if branch_id:
        qs = qs.filter(branch_id=branch_id)
    return qs.first()
