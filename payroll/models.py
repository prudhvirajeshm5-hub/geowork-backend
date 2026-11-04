from decimal import Decimal

from django.db import models

from companies.models import Company


class PayrollSettings(models.Model):
    """One row per company. Controls how salary is turned into pay.
    Only company administrators can change these values."""

    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name="payroll_settings")
    working_days_per_month = models.PositiveSmallIntegerField(
        default=26, help_text="Paid working days used to compute the daily and hourly rate."
    )
    standard_hours_per_day = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal("8.00"),
        help_text="Standard paid hours per day, used for the hourly rate.",
    )
    overtime_multiplier = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal("1.50"),
        help_text="Rate multiplier for overtime hours (1.5 = time and a half).",
    )
    pay_auto_closed_shifts = models.BooleanField(
        default=True,
        help_text=(
            "If on, shifts closed automatically by the system are paid at the overtime multiplier. "
            "If off, those shifts are held and not paid."
        ),
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Payroll settings for {self.company}"
