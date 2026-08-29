from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsCompanyAdmin, ReadOnlyOrAdmin, company_scoped_queryset

from .models import Branch, Company, Department, Designation, ShiftTiming, WorkingDay
from .serializers import (
    BranchSerializer,
    CompanySerializer,
    DepartmentSerializer,
    DesignationSerializer,
    ShiftTimingSerializer,
    WorkingDaySerializer,
)


class CompanyViewSet(viewsets.ModelViewSet):
    """
    Platform superusers see/manage every tenant. A company's own admin can
    only retrieve and update their own company record (no list/create/delete
    for non-superusers) — except a company-less ADMIN-role user (a fresh
    account with no tenant yet) may create exactly one company, which
    becomes theirs automatically. See perform_create below.
    """

    serializer_class = CompanySerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["is_active", "plan"]
    search_fields = ["name", "gstin", "contact_email"]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return Company.objects.all()
        return Company.objects.filter(id=user.company_id)

    def get_permissions(self):
        if self.action in ("create", "destroy"):
            return [IsAuthenticated(), IsCompanyAdmin()]
        if self.action in ("update", "partial_update"):
            return [IsAuthenticated(), IsCompanyAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        company = serializer.save()
        user = self.request.user
        # Self-serve onboarding: an ADMIN-role user with no company yet
        # (created via Django admin or signup, before any tenant existed)
        # becomes this company's admin the moment they set it up — no
        # separate "assign company to user" step needed in Django admin.
        # True platform superusers are exempt so they aren't accidentally
        # locked into whichever tenant they happen to create first.
        if not user.is_superuser and user.company_id is None:
            user.company = company
            user.save(update_fields=["company"])


class TenantScopedViewSet(viewsets.ModelViewSet):
    """Base class: auto-scopes queryset to request.user.company and stamps it on create."""

    permission_classes = [ReadOnlyOrAdmin]
    company_field = "company"

    def get_queryset(self):
        return company_scoped_queryset(self.queryset, self.request, self.company_field)

    def perform_create(self, serializer):
        company = self.request.user.company
        if company is None:
            # Platform-level admins (user.company is None) aren't scoped to
            # any tenant, so there's nothing to stamp this record with.
            # Without this check, serializer.save(company=None) would hit
            # the database's NOT NULL constraint directly and raise a raw,
            # unhandled IntegrityError — a 500 with a full debug traceback
            # instead of a clean, expected API error.
            raise PermissionDenied(
                "This account is not associated with a company. "
                "Log in as a company admin to create this record."
            )
        serializer.save(company=company)


class BranchViewSet(TenantScopedViewSet):
    queryset = Branch.objects.select_related("company").all()
    serializer_class = BranchSerializer
    filterset_fields = ["is_active", "city", "state"]
    search_fields = ["name", "code", "city"]


class DepartmentViewSet(TenantScopedViewSet):
    queryset = Department.objects.select_related("company", "branch").all()
    serializer_class = DepartmentSerializer
    filterset_fields = ["is_active", "branch"]
    search_fields = ["name"]


class DesignationViewSet(TenantScopedViewSet):
    queryset = Designation.objects.select_related("company", "department").all()
    serializer_class = DesignationSerializer
    filterset_fields = ["is_active", "department", "level"]
    search_fields = ["title"]


class ShiftTimingViewSet(TenantScopedViewSet):
    queryset = ShiftTiming.objects.select_related("company", "branch").prefetch_related("working_days").all()
    serializer_class = ShiftTimingSerializer
    filterset_fields = ["is_active", "branch", "is_night_shift"]
    search_fields = ["name"]


class WorkingDayViewSet(TenantScopedViewSet):
    queryset = WorkingDay.objects.select_related("company", "shift").all()
    serializer_class = WorkingDaySerializer
    filterset_fields = ["shift", "weekday", "is_working"]
