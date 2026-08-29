from rest_framework import serializers

from companies.models import Branch

from .models import ShapeType, WorkArea
from .utils import point_from_latlng, polygon_from_circle, polygon_from_points, polygon_from_rectangle


class LatLngSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)


def _boundary_to_points(boundary):
    """Convert a stored Polygon's exterior ring back to lat/lng dicts for the map UI (drop the closing point)."""
    coords = list(boundary.exterior_ring.coords)[:-1]
    return [{"latitude": lat, "longitude": lng} for lng, lat in coords]


class WorkAreaSerializer(serializers.ModelSerializer):
    """
    Read/write serializer. On write, exactly one of `points` (polygon),
    `bounds` (rectangle), or `center`+`radius_meters` (circle) must be sent,
    matching `shape_type`. On read, `points` always contains the polygon
    (or polygon approximation, for circles) so the map can render it, and
    `center`/`radius_meters` are only populated for circles so the editor
    can redraw an exact circle.
    """

    points = LatLngSerializer(many=True, write_only=True, required=False)
    bounds = serializers.DictField(write_only=True, required=False)
    center = LatLngSerializer(write_only=True, required=False)

    boundary_points = serializers.SerializerMethodField()
    center_out = serializers.SerializerMethodField()
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = WorkArea
        fields = (
            "id", "company", "branch", "branch_name", "name", "category", "color",
            "shape_type", "points", "bounds", "center", "radius_meters",
            "boundary_points", "center_out", "is_active", "created_by",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "company", "created_by", "created_at", "updated_at")

    def get_boundary_points(self, obj):
        return _boundary_to_points(obj.boundary)

    def get_center_out(self, obj):
        if obj.shape_type == ShapeType.CIRCLE and obj.center_point:
            return {"latitude": obj.center_point.y, "longitude": obj.center_point.x}
        return None

    def validate_branch(self, branch):
        request = self.context["request"]
        company = getattr(request.user, "company", None)
        if not request.user.is_superuser and branch.company_id != company.id:
            raise serializers.ValidationError("This branch does not belong to your company.")
        return branch

    def validate(self, attrs):
        shape_type = attrs.get("shape_type", getattr(self.instance, "shape_type", None))
        points, bounds, center, radius = (
            attrs.get("points"), attrs.get("bounds"), attrs.get("center"), attrs.get("radius_meters")
        )

        if self.instance is None or any(k in attrs for k in ("points", "bounds", "center", "radius_meters")):
            if shape_type == ShapeType.POLYGON:
                if not points or len(points) < 3:
                    raise serializers.ValidationError({"points": "A polygon needs at least 3 points."})
            elif shape_type == ShapeType.RECTANGLE:
                if not bounds or "south_west" not in bounds or "north_east" not in bounds:
                    raise serializers.ValidationError(
                        {"bounds": "A rectangle needs 'south_west' and 'north_east' lat/lng corners."}
                    )
            elif shape_type == ShapeType.CIRCLE:
                if not center or not radius:
                    raise serializers.ValidationError(
                        {"center": "A circle needs 'center' (lat/lng) and 'radius_meters'."}
                    )
                if radius <= 0:
                    raise serializers.ValidationError({"radius_meters": "Must be a positive number."})
        return attrs

    def _build_geometry(self, validated_data):
        shape_type = validated_data.get("shape_type")
        center_point, radius = None, None

        if shape_type == ShapeType.POLYGON:
            boundary = polygon_from_points(validated_data.pop("points"))
        elif shape_type == ShapeType.RECTANGLE:
            bounds = validated_data.pop("bounds")
            boundary = polygon_from_rectangle(bounds["south_west"], bounds["north_east"])
        elif shape_type == ShapeType.CIRCLE:
            center = validated_data.pop("center")
            radius = validated_data.get("radius_meters")
            boundary = polygon_from_circle(center["latitude"], center["longitude"], radius)
            center_point = point_from_latlng(center["latitude"], center["longitude"])
        else:
            raise serializers.ValidationError({"shape_type": "Unsupported shape type."})

        validated_data.pop("points", None)
        validated_data.pop("bounds", None)
        validated_data.pop("center", None)
        return boundary, center_point, radius

    def create(self, validated_data):
        company = self.context["request"].user.company
        if company is None:
            # Same class of bug as companies/views.py TenantScopedViewSet:
            # a platform-level admin (user.company is None) has no tenant
            # to stamp this WorkArea with. Without this check, the None
            # falls straight through to the DB's NOT NULL constraint on
            # WorkArea.company and raises a raw, unhandled IntegrityError.
            raise serializers.ValidationError(
                "This account is not associated with a company. "
                "Log in as a company admin to create a geofence."
            )
        validated_data["company"] = company
        validated_data["created_by"] = self.context["request"].user
        boundary, center_point, radius = self._build_geometry(validated_data)
        validated_data["boundary"] = boundary
        validated_data["center_point"] = center_point
        if radius is not None:
            validated_data["radius_meters"] = radius
        return WorkArea.objects.create(**validated_data)

    def update(self, instance, validated_data):
        if any(k in validated_data for k in ("points", "bounds", "center", "radius_meters", "shape_type")):
            merged = {"shape_type": validated_data.get("shape_type", instance.shape_type), **validated_data}
            boundary, center_point, radius = self._build_geometry(merged)
            instance.boundary = boundary
            instance.center_point = center_point
            if radius is not None:
                instance.radius_meters = radius
        for attr in ("name", "category", "color", "shape_type", "branch", "is_active"):
            if attr in validated_data:
                setattr(instance, attr, validated_data[attr])
        instance.save()
        return instance


class PointCheckSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all(), required=False)


class WorkAreaMatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkArea
        fields = ("id", "name", "category", "color", "shape_type", "branch")