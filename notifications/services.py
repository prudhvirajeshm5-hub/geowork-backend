"""
Every trigger the spec lists lives here as one small, named function, each
called from the exact place in Attendance (Module 5) / Tracking (Module 6)
where that event actually happens. Keeping the trigger points centralized
here — rather than scattering ad-hoc `Notification.objects.create(...)`
calls through other apps — means the full list of "when do we notify
someone" is readable in one file.
"""
import logging

from django.utils import timezone

from .models import DeliveryStatus, Notification, NotificationType

logger = logging.getLogger(__name__)


def send_push_notification(device, title, body, data=None):
    """
    Stub push delivery. Logs instead of calling Firebase Cloud Messaging so
    this works out of the box in local/dev without real FCM credentials.

    To wire up real delivery: install `firebase-admin`, initialize it once
    with a service account (see README), and replace the body of this
    function with a `messaging.send(...)` call using `device.fcm_token`.
    Every call site above (create_notification) is already written against
    this function's signature, so swapping the implementation here is the
    only change needed.
    """
    logger.info("PUSH -> device=%s title=%r body=%r data=%s", device.device_id, title, body, data or {})
    return True


def create_notification(user, notification_type, title, body, data=None):
    notification = Notification.objects.create(
        recipient=user,
        company=user.company,
        notification_type=notification_type,
        title=title,
        body=body,
        data=data or {},
    )

    from accounts.models import Device

    devices = Device.objects.filter(user=user, is_active=True)
    delivered = False
    for device in devices:
        try:
            if send_push_notification(device, title, body, data):
                delivered = True
        except Exception:
            logger.exception("Push delivery failed for device %s", device.device_id)

    notification.delivery_status = DeliveryStatus.SENT if delivered else (
        DeliveryStatus.NO_DEVICE if not devices.exists() else DeliveryStatus.FAILED
    )
    notification.save(update_fields=["delivery_status"])
    return notification


def _notify_manager(employee, notification_type, title, body, data=None):
    if employee.manager_id and employee.manager.user_id:
        create_notification(employee.manager.user, notification_type, title, body, data)


def notify_shift_start(record):
    employee = record.employee
    check_in_str = timezone.localtime(record.check_in_time).strftime("%H:%M")
    create_notification(
        employee.user, NotificationType.SHIFT_START, "Shift started",
        f"You checked in at {check_in_str}.", data={"attendance_record_id": record.id},
    )
    area_name = record.check_in_work_area.name if record.check_in_work_area else "an unknown area"
    _notify_manager(
        employee, NotificationType.SHIFT_START, f"{employee.user.get_full_name()} started their shift",
        f"Checked in at {check_in_str} ({area_name}).",
        data={"attendance_record_id": record.id, "employee_id": employee.id},
    )
    if record.is_late:
        notify_late_arrival(record)


def notify_late_arrival(record):
    employee = record.employee
    create_notification(
        employee.user, NotificationType.LATE_ARRIVAL, "You're marked late",
        f"You checked in {record.late_by_minutes} minute(s) late.", data={"attendance_record_id": record.id},
    )
    _notify_manager(
        employee, NotificationType.LATE_ARRIVAL, f"{employee.user.get_full_name()} is late",
        f"Checked in {record.late_by_minutes} minute(s) late.",
        data={"attendance_record_id": record.id, "employee_id": employee.id},
    )


def notify_shift_end(record):
    employee = record.employee
    hours, minutes = divmod(record.working_minutes, 60)
    create_notification(
        employee.user, NotificationType.SHIFT_END, "Shift ended",
        f"You checked out. Total working time: {hours}h {minutes}m.", data={"attendance_record_id": record.id},
    )
    _notify_manager(
        employee, NotificationType.SHIFT_END, f"{employee.user.get_full_name()} ended their shift",
        f"Worked {hours}h {minutes}m today.",
        data={"attendance_record_id": record.id, "employee_id": employee.id},
    )


def notify_geofence_event(employee, event_type, work_area):
    """Manager-facing only — an employee doesn't need a push telling them they walked through their own gate."""
    notification_type = NotificationType.GEOFENCE_ENTER if event_type == "ENTER" else NotificationType.GEOFENCE_EXIT
    verb = "entered" if event_type == "ENTER" else "exited"
    area_name = work_area.name if work_area else "a work area"
    _notify_manager(
        employee, notification_type, f"{employee.user.get_full_name()} {verb} {area_name}",
        f"{verb.capitalize()} '{area_name}' just now.",
        data={"employee_id": employee.id, "work_area_id": work_area.id if work_area else None},
    )


def notify_gps_disabled(employee):
    _notify_manager(
        employee, NotificationType.GPS_DISABLED, f"{employee.user.get_full_name()}'s GPS is off",
        "Location tracking has been disabled on their device.", data={"employee_id": employee.id},
    )


def notify_internet_disconnected(employee):
    _notify_manager(
        employee, NotificationType.INTERNET_DISCONNECTED,
        f"{employee.user.get_full_name()} lost internet connectivity",
        "Their device reported no internet connection.", data={"employee_id": employee.id},
    )


def notify_absent(employee, target_date):
    create_notification(
        employee.user, NotificationType.ABSENT, "Marked absent",
        f"You were marked absent for {target_date}.", data={"date": str(target_date)},
    )
    _notify_manager(
        employee, NotificationType.ABSENT, f"{employee.user.get_full_name()} is absent",
        f"No attendance recorded for {target_date}.",
        data={"employee_id": employee.id, "date": str(target_date)},
    )


def notify_transfer_requested(transfer):
    """Notify whoever needs to decide: the assigned manager, or every admin
    in the company if the employee has no manager on file."""
    employee = transfer.employee
    title = f"Transfer request: {employee.user.get_full_name()}"
    body = f"Requested move to {transfer.to_branch.name}."
    data = {"transfer_request_id": transfer.id, "employee_id": employee.id}

    if transfer.approver_id and transfer.approver.user_id:
        create_notification(transfer.approver.user, NotificationType.TRANSFER_REQUESTED, title, body, data)
        return

    from accounts.models import Role, User

    admins = User.objects.filter(company_id=transfer.company_id, role=Role.ADMIN, is_active=True)
    for admin in admins:
        create_notification(admin, NotificationType.TRANSFER_REQUESTED, title, body, data)


def notify_transfer_decided(transfer):
    employee = transfer.employee
    approved = transfer.status == "APPROVED"
    data = {"transfer_request_id": transfer.id}

    create_notification(
        employee.user,
        NotificationType.TRANSFER_APPROVED if approved else NotificationType.TRANSFER_REJECTED,
        "Transfer approved" if approved else "Transfer request rejected",
        (
            f"You have been transferred to {transfer.to_branch.name}."
            if approved
            else f"Your transfer to {transfer.to_branch.name} was not approved."
        ),
        data=data,
    )
    if transfer.requested_by_id and transfer.requested_by_id != employee.user_id:
        create_notification(
            transfer.requested_by,
            NotificationType.TRANSFER_APPROVED if approved else NotificationType.TRANSFER_REJECTED,
            f"Transfer {'approved' if approved else 'rejected'}: {employee.user.get_full_name()}",
            (
                f"Moved to {transfer.to_branch.name}."
                if approved
                else f"Transfer to {transfer.to_branch.name} was rejected."
            ),
            data=data,
        )


def notify_outdoor_duty_requested(request_obj):
    """Notify whoever needs to decide: the assigned manager, or every admin
    in the company if the employee has no manager on file."""
    employee = request_obj.employee
    title = f"Outdoor duty request: {employee.user.get_full_name()}"
    body = f"Requested {request_obj.start_date} to {request_obj.end_date}."
    data = {"outdoor_duty_request_id": request_obj.id, "employee_id": employee.id}

    if request_obj.approver_id and request_obj.approver.user_id:
        create_notification(request_obj.approver.user, NotificationType.OUTDOOR_DUTY_REQUESTED, title, body, data)
        return

    from accounts.models import Role, User

    admins = User.objects.filter(company_id=request_obj.company_id, role=Role.ADMIN, is_active=True)
    for admin in admins:
        create_notification(admin, NotificationType.OUTDOOR_DUTY_REQUESTED, title, body, data)


def notify_outdoor_duty_decided(request_obj):
    employee = request_obj.employee
    approved = request_obj.status == "APPROVED"
    data = {"outdoor_duty_request_id": request_obj.id}
    date_range = (
        f"{request_obj.start_date} to {request_obj.end_date}"
        if request_obj.start_date != request_obj.end_date
        else str(request_obj.start_date)
    )

    create_notification(
        employee.user,
        NotificationType.OUTDOOR_DUTY_APPROVED if approved else NotificationType.OUTDOOR_DUTY_REJECTED,
        "Outdoor duty approved" if approved else "Outdoor duty request rejected",
        (
            f"You can check in from anywhere during {date_range}."
            if approved
            else f"Your outdoor duty request for {date_range} was not approved."
        ),
        data=data,
    )
    if request_obj.requested_by_id and request_obj.requested_by_id != employee.user_id:
        create_notification(
            request_obj.requested_by,
            NotificationType.OUTDOOR_DUTY_APPROVED if approved else NotificationType.OUTDOOR_DUTY_REJECTED,
            f"Outdoor duty {'approved' if approved else 'rejected'}: {employee.user.get_full_name()}",
            f"{date_range}.",
            data=data,
        )