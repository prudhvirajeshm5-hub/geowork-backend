"""
Geometry construction helpers for Module 4.

The Flutter map editor sends plain lat/lng JSON (Google Maps' native
coordinate format); these helpers turn that into GEOS geometries for
storage and containment queries. Keeping this isolated from serializers.py
makes the math independently unit-testable.
"""
import math

from django.contrib.gis.geos import Point, Polygon

METERS_PER_DEGREE_LAT = 111_320  # constant; longitude scales by cos(latitude)


def point_from_latlng(latitude, longitude):
    return Point(float(longitude), float(latitude), srid=4326)


def polygon_from_points(points):
    """
    points: list of {"latitude": .., "longitude": ..} dicts, in order,
    describing the polygon's vertices (do not repeat the first point).
    """
    if len(points) < 3:
        raise ValueError("A polygon needs at least 3 points.")
    ring = [(float(p["longitude"]), float(p["latitude"])) for p in points]
    ring.append(ring[0])  # GEOS requires a closed linear ring
    polygon = Polygon(ring, srid=4326)
    return polygon


def polygon_from_rectangle(south_west, north_east):
    """
    south_west / north_east: {"latitude": .., "longitude": ..} dicts for the
    two opposite corners of an axis-aligned rectangle.
    """
    sw_lat, sw_lng = float(south_west["latitude"]), float(south_west["longitude"])
    ne_lat, ne_lng = float(north_east["latitude"]), float(north_east["longitude"])
    if sw_lat >= ne_lat or sw_lng >= ne_lng:
        raise ValueError("north_east must be strictly north and east of south_west.")
    ring = [
        (sw_lng, sw_lat),
        (ne_lng, sw_lat),
        (ne_lng, ne_lat),
        (sw_lng, ne_lat),
        (sw_lng, sw_lat),
    ]
    return Polygon(ring, srid=4326)


def polygon_from_circle(center_lat, center_lng, radius_meters, segments=48):
    """
    Approximates a circle as a regular polygon using an equirectangular
    (flat-earth) offset. Accurate to well under 1% error for geofence-scale
    radii (tens of meters to a few kilometers) — more than sufficient for
    workplace boundary checks, and avoids a heavier geodesic-buffer dependency.
    """
    if radius_meters <= 0:
        raise ValueError("radius_meters must be positive.")
    lat_rad = math.radians(center_lat)
    meters_per_degree_lng = METERS_PER_DEGREE_LAT * math.cos(lat_rad) or 1e-9

    ring = []
    for i in range(segments):
        angle = 2 * math.pi * i / segments
        d_lat = (radius_meters * math.cos(angle)) / METERS_PER_DEGREE_LAT
        d_lng = (radius_meters * math.sin(angle)) / meters_per_degree_lng
        ring.append((center_lng + d_lng, center_lat + d_lat))
    ring.append(ring[0])
    return Polygon(ring, srid=4326)
