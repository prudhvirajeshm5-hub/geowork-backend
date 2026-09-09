"""
V1.1 requirement #4: after an admin/manager sets a temporary password for an
employee (employees.views.EmployeeViewSet.reset_password, mode=
"temporary_password"), that employee must change it before doing anything
else. Enforced here — inside authentication rather than as a permission —
so it applies to every endpoint uniformly (DRF's DEFAULT_AUTHENTICATION_CLASSES
runs for every request regardless of each view's own permission_classes),
with no risk of a new view forgetting to add the check.
"""
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

# Endpoints a locked-out user is still allowed to hit — otherwise they'd
# have no way to actually change the password they're being forced to change.
_ALLOWED_PATH_PREFIXES = (
    "/api/v1/auth/password/change/",
    "/api/v1/auth/logout",
    "/api/v1/auth/token/refresh/",
    "/api/v1/auth/me/",
)


class ForcePasswordChangeJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, validated_token = result
        if getattr(user, "must_change_password", False) and not request.path.startswith(_ALLOWED_PATH_PREFIXES):
            raise PermissionDenied(
                {"detail": "You must change your temporary password before continuing.", "code": "password_change_required"}
            )
        return result
