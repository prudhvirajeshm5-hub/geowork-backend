from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import Role


class IsCompanyAdmin(BasePermission):
    """Allows access only to ADMIN-role users of their own company."""

    message = "Only company administrators can perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_superuser or request.user.role == Role.ADMIN)
        )


class IsManagerOrAdmin(BasePermission):
    message = "Only managers or administrators can perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_superuser or request.user.role in (Role.ADMIN, Role.MANAGER))
        )


class ReadOnlyOrAdmin(BasePermission):
    """Any authenticated user in the tenant can read; only admins can write."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_superuser or request.user.role == Role.ADMIN


class IsSameCompany(BasePermission):
    """
    Object-level check ensuring a user can only touch objects belonging to
    their own company (multi-tenant isolation). Platform superusers bypass this.
    """

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True
        obj_company = getattr(obj, "company", None) or getattr(obj, "company_id", None)
        return obj_company == request.user.company_id or obj_company == request.user.company


def company_scoped_queryset(queryset, request, company_field="company"):
    """Filter a queryset down to the requesting user's company, unless superuser."""
    user = request.user
    if user.is_superuser:
        return queryset
    if not user.company_id:
        return queryset.none()
    return queryset.filter(**{company_field: user.company_id})
