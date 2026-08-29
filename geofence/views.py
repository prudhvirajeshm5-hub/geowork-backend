from django.contrib.gis.geos import Point
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import ReadOnlyOrAdmin, company_scoped_queryset

from .models import WorkArea, WorkAreaAuditLog
from .serializers import PointCheckSerializer, WorkAreaMatchSerializer, WorkAreaSerializer


def _log(work_area, company, action_, user, snapshot):
    WorkAreaAuditLog.objects.create(
        work_area=work_area,
        company=company,
        work_area_name=work_area.name,
        action=action_,
        performed_by=user,
        snapshot=snapshot,
    )


def _snapshot(instance):
    return {
        "shape_type": instance.shape_type,
        "branch_id": instance.branch_id,
        "color": instance.color,
        "boundary_wkt": instance.boundary.wkt if instance.boundary else None,
        "radius_meters": instance.radius_meters,
    }


class WorkAreaViewSet(viewsets.ModelViewSet):
    """
    Module 4 - Interactive Geofence Builder.
    Read: any authenticated tenant user (mobile app needs this to show
    "which zone am I in" and to render the map). Write: admins only —
    geofences drive attendance and payroll, so boundary edits are audited.
    """

    queryset = WorkArea.objects.select_related("company", "branch", "created_by").all()
    permission_classes = [ReadOnlyOrAdmin]
    filterset_fields = ["branch", "shape_type", "category", "is_active"]
    search_fields = ["name"]

    def get_queryset(self):
        return company_scoped_queryset(self.queryset, self.request)

    def get_serializer_class(self):
        return WorkAreaSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        _log(instance, instance.company, WorkAreaAuditLog.Action.CREATED, self.request.user, _snapshot(instance))

    def perform_update(self, serializer):
        instance = serializer.save()
        _log(instance, instance.company, WorkAreaAuditLog.Action.UPDATED, self.request.user, _snapshot(instance))

    def perform_destroy(self, instance):
        _log(instance, instance.company, WorkAreaAuditLog.Action.DELETED, self.request.user, _snapshot(instance))
        instance.delete()

    @action(detail=False, methods=["post"], url_path="check-point")
    def check_point(self, request):
        """
        Given a lat/lng (and optionally a branch), returns every active work
        area whose boundary contains that point. This is the core query
        Module 5 (attendance) and Module 6 (live tracking) build on.
        """
        serializer = PointCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        point = Point(data["longitude"], data["latitude"], srid=4326)
        qs = self.get_queryset().filter(is_active=True, boundary__contains=point)
        if data.get("branch"):
            qs = qs.filter(branch=data["branch"])

        matches = list(qs)
        return Response(
            {
                "inside_any_work_area": bool(matches),
                "matches": WorkAreaMatchSerializer(matches, many=True).data,
            },
            status=status.HTTP_200_OK,
        )
