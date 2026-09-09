"""
Single entry point for writing to accounts.AuditLog, so every call site
(views in this app and others) records the same shape of row instead of
each constructing AuditLog.objects.create(...) slightly differently.
"""
from .models import AuditLog


def log_action(action, performed_by=None, target_user=None, request=None, metadata=None):
    company = None
    if target_user is not None:
        company = getattr(target_user, "company", None)
    elif performed_by is not None:
        company = getattr(performed_by, "company", None)

    ip_address = None
    if request is not None:
        # Respect a proxy-set X-Forwarded-For if present (Render/most PaaS
        # sit behind one), falling back to the direct connection address.
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        ip_address = forwarded_for.split(",")[0].strip() if forwarded_for else request.META.get("REMOTE_ADDR")

    AuditLog.objects.create(
        company=company,
        target_user=target_user,
        performed_by=performed_by if (performed_by and performed_by.is_authenticated) else None,
        action=action,
        ip_address=ip_address,
        metadata=metadata or {},
    )
