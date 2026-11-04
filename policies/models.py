from django.db import models

from companies.models import Company

# Titles from the app design. HR adds the text and publishes each one.
DEFAULT_POLICIES = [
    ("working-hours", "Working Hours", "Shift timings and attendance rules"),
    ("leave-policy", "Leave Policy", "Types of leave and eligibility"),
    ("outdoor-duty-rules", "Outdoor Duty Rules", "Process and permissions"),
    ("overtime-policy", "Overtime Policy", "Overtime calculation and approval"),
    ("code-of-conduct", "Code of Conduct", "Workplace behaviour guidelines"),
    ("disciplinary-policy", "Disciplinary Policy", "Violation and penalties"),
]

# Starter questions about how this app works. Edit them in the Django admin.
DEFAULT_FAQ = [
    (
        "How do I check in?",
        "Open the Home tab and tap Check In while you are inside your work area. "
        "If you are visiting a client or site outside the area, raise an outdoor duty request first.",
    ),
    (
        "Why does the app say I am outside the work area?",
        "Your location is outside the drawn work area. Move closer to the site. "
        "If you are on duty elsewhere, raise an outdoor duty request under Requests.",
    ),
    (
        "What does 'Earned so far today' mean?",
        "It is the amount you have earned for today's hours so far, based on your monthly salary. "
        "It is final once you check out.",
    ),
    (
        "How do I change my profile photo or theme?",
        "Open More and tap My profile to set a photo. Open More and then Settings to change the theme.",
    ),
]


class Policy(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="policies")
    slug = models.SlugField(max_length=60)
    title = models.CharField(max_length=120)
    subtitle = models.CharField(max_length=160, blank=True)
    body = models.TextField(blank=True)
    is_published = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("company", "slug")
        ordering = ["order", "title"]

    def __str__(self):
        return self.title


class Holiday(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="holidays")
    date = models.DateField()
    name = models.CharField(max_length=120)

    class Meta:
        unique_together = ("company", "date")
        ordering = ["date"]

    def __str__(self):
        return f"{self.date} {self.name}"


class FaqItem(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="faq_items")
    question = models.CharField(max_length=200)
    answer = models.TextField()
    is_published = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.question
