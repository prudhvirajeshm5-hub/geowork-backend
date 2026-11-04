from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from .services import compute_pay


def _settings(**overrides):
    values = dict(
        working_days_per_month=26,
        standard_hours_per_day=Decimal("8.00"),
        overtime_multiplier=Decimal("1.50"),
        pay_auto_closed_shifts=True,
    )
    values.update(overrides)
    return SimpleNamespace(**values)


def _day(minutes, cap=480, auto=False):
    return {"worked_minutes": minutes, "cap_minutes": cap, "auto_closed": auto}


class PayCalculationTests(SimpleTestCase):
    def test_hourly_rate(self):
        result = compute_pay(Decimal("10000"), _settings(), [_day(480)])
        self.assertEqual(result["hourly_rate"], Decimal("48.08"))

    def test_seven_and_a_half_hours(self):
        result = compute_pay(Decimal("10000"), _settings(), [_day(450)])
        self.assertEqual(result["pay"], Decimal("360.58"))

    def test_overtime_is_paid_at_multiplier(self):
        result = compute_pay(Decimal("10000"), _settings(), [_day(540)])
        self.assertEqual(result["pay"], Decimal("456.73"))
        self.assertEqual(result["overtime_minutes"], 60)

    def test_full_month_equals_salary(self):
        result = compute_pay(Decimal("10000"), _settings(), [_day(480)] * 26)
        self.assertEqual(result["pay"], Decimal("10000.00"))

    def test_auto_closed_paid_at_multiplier(self):
        result = compute_pay(Decimal("10000"), _settings(), [_day(720, auto=True)])
        self.assertEqual(result["pay"], Decimal("865.38"))

    def test_auto_closed_held_when_disabled(self):
        result = compute_pay(
            Decimal("10000"), _settings(pay_auto_closed_shifts=False), [_day(720, auto=True)]
        )
        self.assertEqual(result["pay"], Decimal("0.00"))
        self.assertEqual(result["held_minutes"], 720)
