
import uuid
from datetime import timedelta
from unittest.mock import patch

from django.contrib.gis.geos import Polygon
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import User
from attendance.models import AttendanceRecord
from companies.models import Branch, Company
from employees.models import Employee
from geofence.models import ShapeType, WorkArea
from tracking.models import EmployeeLiveStatus, LocationPing
from tracking.services import process_ping


@override_settings(
    GEOFENCE_ENTRY_DEBOUNCE_SECONDS=1,
    GEOFENCE_EXIT_DEBOUNCE_SECONDS=1,
    LIVE_TRACKING_MAX_EVENT_AGE_MINUTES=10,
)
class TrackingReliabilityTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(
            name="Tracking Test Company",
            slug=f"tracking-test-{uuid.uuid4().hex[:8]}",
        )

        self.branch = Branch.objects.create(
            company=self.company,
            name="Test Branch",
            code=f"T{uuid.uuid4().hex[:6]}",
        )

        self.user = User.objects.create_user(
            phone=f"9{uuid.uuid4().int % 1000000000:09d}",
            password="test-password",
            company=self.company,
        )

        self.employee = Employee.objects.create(
            user=self.user,
            company=self.company,
            branch=self.branch,
            employee_code=f"TEST-{uuid.uuid4().hex[:8]}",
        )

        self.area_a = self.make_area(
            "Area A", 73.800, 18.300
        )
        self.area_b = self.make_area(
            "Area B", 73.810, 18.300
        )

    def make_area(self, name, longitude, latitude):
        boundary = Polygon(
            (
                (longitude - 0.001, latitude - 0.001),
                (longitude + 0.001, latitude - 0.001),
                (longitude + 0.001, latitude + 0.001),
                (longitude - 0.001, latitude + 0.001),
                (longitude - 0.001, latitude - 0.001),
            ),
            srid=4326,
        )

        return WorkArea.objects.create(
            company=self.company,
            branch=self.branch,
            name=name,
            shape_type=ShapeType.POLYGON,
            boundary=boundary,
        )

    def ping(self, longitude, latitude=18.300, **kwargs):
        return process_ping(
            self.user,
            latitude=latitude,
            longitude=longitude,
            accuracy_meters=5,
            recorded_at=timezone.now(),
            **kwargs,
        )

    def confirm_area(self, area):
        longitude = area.center_point.x if area.center_point else (
            73.800 if area == self.area_a else 73.810
        )

        first_time = timezone.now() - timedelta(seconds=20)

        process_ping(
            self.user,
            latitude=18.300,
            longitude=longitude,
            accuracy_meters=5,
            recorded_at=first_time,
        )

        process_ping(
            self.user,
            latitude=18.300,
            longitude=longitude,
            accuracy_meters=5,
            recorded_at=first_time + timedelta(seconds=2),
        )

        return EmployeeLiveStatus.objects.get(employee=self.employee)

    @patch("tracking.services.notification_services.notify_geofence_event")
    @patch("tracking.services.attendance_services.process_geofence_event")
    def test_enter_area_triggers_attendance_enter(
        self, attendance_event, notification
    ):
        first_time = timezone.now() - timedelta(seconds=20)

        process_ping(
            self.user,
            latitude=18.300,
            longitude=73.800,
            recorded_at=first_time,
        )

        process_ping(
            self.user,
            latitude=18.300,
            longitude=73.800,
            recorded_at=first_time + timedelta(seconds=2),
        )

        attendance_event.assert_called_once()
        self.assertEqual(attendance_event.call_args.args[1], "ENTER")

        status = EmployeeLiveStatus.objects.get(employee=self.employee)
        self.assertEqual(status.current_work_area, self.area_a)

    @patch("tracking.services.notification_services.notify_geofence_event")
    @patch("tracking.services.attendance_services.process_geofence_event")
    def test_move_between_areas_does_not_checkout_or_checkin(
        self, attendance_event, notification
    ):
        status = self.confirm_area(self.area_a)

        # Establish Area A as the confirmed location.
        status.refresh_from_db()
        self.assertEqual(status.current_work_area, self.area_a)

        attendance_event.reset_mock()

        first_time = timezone.now() - timedelta(seconds=5)

        process_ping(
            self.user,
            latitude=18.300,
            longitude=73.810,
            recorded_at=first_time,
        )

        process_ping(
            self.user,
            latitude=18.300,
            longitude=73.810,
            recorded_at=first_time + timedelta(seconds=2),
        )

        status.refresh_from_db()

        self.assertEqual(status.current_work_area, self.area_b)
        self.assertIsNone(status.candidate_work_area)

        # A direct A-to-B move must not trigger attendance EXIT or ENTER.
        attendance_event.assert_not_called()

    @patch("tracking.services.notification_services.notify_geofence_event")
    @patch("tracking.services.attendance_services.process_geofence_event")
    def test_leaving_all_areas_triggers_exit(
        self, attendance_event, notification
    ):
        self.confirm_area(self.area_a)
        attendance_event.reset_mock()

        first_time = timezone.now() - timedelta(seconds=5)

        # Outside both test polygons.
        process_ping(
            self.user,
            latitude=18.320,
            longitude=73.800,
            recorded_at=first_time,
        )

        process_ping(
            self.user,
            latitude=18.320,
            longitude=73.800,
            recorded_at=first_time + timedelta(seconds=2),
        )

        status = EmployeeLiveStatus.objects.get(employee=self.employee)
        self.assertIsNone(status.current_work_area)

        attendance_event.assert_called_once()
        self.assertEqual(attendance_event.call_args.args[1], "EXIT")

    def test_duplicate_event_id_is_not_saved_twice(self):
        event_id = uuid.uuid4()
        first_time = timezone.now() - timedelta(seconds=5)

        process_ping(
            self.user,
            latitude=18.300,
            longitude=73.800,
            recorded_at=first_time,
            event_id=event_id,
        )

        count_before = LocationPing.objects.filter(
            employee=self.employee
        ).count()

        process_ping(
            self.user,
            latitude=18.320,
            longitude=73.800,
            recorded_at=first_time + timedelta(seconds=1),
            event_id=event_id,
        )

        count_after = LocationPing.objects.filter(
            employee=self.employee
        ).count()

        self.assertEqual(count_after, count_before)

    def test_out_of_order_ping_does_not_replace_latest_location(self):
        latest_time = timezone.now() - timedelta(seconds=5)

        process_ping(
            self.user,
            latitude=18.300,
            longitude=73.800,
            recorded_at=latest_time,
        )

        status = EmployeeLiveStatus.objects.get(employee=self.employee)
        latest_location = status.last_location.clone()
        latest_ping_time = status.last_ping_at

        process_ping(
            self.user,
            latitude=18.320,
            longitude=73.800,
            recorded_at=latest_time - timedelta(seconds=1),
        )

        status.refresh_from_db()

        self.assertEqual(status.last_location, latest_location)
        self.assertEqual(status.last_ping_at, latest_ping_time)
