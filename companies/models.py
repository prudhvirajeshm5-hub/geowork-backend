from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Company(models.Model):
    class Plan(models.TextChoices):
        TRIAL = "TRIAL", "Trial"
        STANDARD = "STANDARD", "Standard"
        ENTERPRISE = "ENTERPRISE", "Enterprise"

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    logo = models.ImageField(upload_to="company_logos/", null=True, blank=True)
    registered_address = models.TextField(blank=True)
    gstin = models.CharField(max_length=20, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.TRIAL)
    max_employees = models.PositiveIntegerField(default=50)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Companies"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Branch(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="branches")
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=20, blank=True, help_text="Short internal branch code")
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, default="India")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("company", "code")
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.company.name})"


class Department(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="departments")
    branch = models.ForeignKey(
        Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="departments"
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("company", "name")
        ordering = ["name"]

    def __str__(self):
        return self.name


class Designation(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="designations")
    department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True, related_name="designations"
    )
    title = models.CharField(max_length=150)
    level = models.PositiveSmallIntegerField(
        default=1, help_text="Seniority level, lower is more senior (1 = highest)"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("company", "title")
        ordering = ["level", "title"]

    def __str__(self):
        return self.title


class ShiftTiming(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="shifts")
    branch = models.ForeignKey(
        Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="shifts"
    )
    name = models.CharField(max_length=100)
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_night_shift = models.BooleanField(
        default=False, help_text="True when end_time is on the following calendar day"
    )
    grace_period_minutes = models.PositiveSmallIntegerField(
        default=10, help_text="Minutes after start_time before an arrival counts as late"
    )
    half_day_after_minutes = models.PositiveIntegerField(
        default=240, help_text="Minutes of presence below which the day counts as half-day"
    )
    full_day_minutes = models.PositiveIntegerField(
        default=480, help_text="Minutes of presence required for a full working day"
    )
    # Scheduled lunch/meal break window. Both null (the default) means this
    # shift has no configured break — geofence EXIT always auto checks-out,
    # same as before this feature existed. When both are set, a geofence
    # EXIT that happens inside this window is treated as "gone on break"
    # instead of "end of shift": attendance.services.process_geofence_event
    # opens a BreakPeriod instead of ending the shift, and the matching
    # re-ENTER closes it and adds the elapsed minutes to the day's
    # AttendanceRecord.total_break_minutes — the employee is never auto
    # checked-out for leaving during this window.
    break_start_time = models.TimeField(
        null=True, blank=True, help_text="Start of the daily lunch/meal break, if any"
    )
    break_end_time = models.TimeField(
        null=True, blank=True, help_text="End of the daily lunch/meal break, if any"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("company", "name")
        ordering = ["start_time"]

    def __str__(self):
        return f"{self.name} ({self.start_time}-{self.end_time})"


class WorkingDay(models.Model):
    class Weekday(models.IntegerChoices):
        MONDAY = 0, "Monday"
        TUESDAY = 1, "Tuesday"
        WEDNESDAY = 2, "Wednesday"
        THURSDAY = 3, "Thursday"
        FRIDAY = 4, "Friday"
        SATURDAY = 5, "Saturday"
        SUNDAY = 6, "Sunday"

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="working_days")
    shift = models.ForeignKey(
        ShiftTiming, on_delete=models.CASCADE, related_name="working_days", null=True, blank=True
    )
    weekday = models.IntegerField(choices=Weekday.choices, validators=[MinValueValidator(0), MaxValueValidator(6)])
    is_working = models.BooleanField(default=True)

    class Meta:
        unique_together = ("company", "shift", "weekday")
        ordering = ["weekday"]

    def __str__(self):
        return f"{self.get_weekday_display()} - {'Working' if self.is_working else 'Off'}"
