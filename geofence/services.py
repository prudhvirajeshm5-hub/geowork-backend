"""
Shared spatial lookups used by any module that needs to answer "which work
area is this point inside?" — currently Attendance (Module 5) and Live
Tracking (Module 6). Keeping this in one place means both modules always
agree on containment rules as Module 4's geofence logic evolves (e.g. when
V3's nested/multi-level geofencing lands).
"""
from .models import WorkArea


def find_containing_work_area(company_id, latitude, longitude, branch_id=None):
    """
    Returns the first active WorkArea (scoped to company, optionally branch)
    whose boundary contains (latitude, longitude), or None.
    """
    qs = WorkArea.objects.filter(company_id=company_id, is_active=True)
    if branch_id:
        qs = qs.filter(branch_id=branch_id)
    for work_area in qs:
        if work_area.contains_point(latitude, longitude):
            return work_area
    return None
