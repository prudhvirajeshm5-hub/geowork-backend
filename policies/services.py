from .models import DEFAULT_FAQ, DEFAULT_POLICIES, FaqItem, Policy


def ensure_defaults(company):
    """Create the standard policy entries and starter FAQ for a company, once."""
    for order, (slug, title, subtitle) in enumerate(DEFAULT_POLICIES):
        Policy.objects.get_or_create(
            company=company,
            slug=slug,
            defaults={"title": title, "subtitle": subtitle, "order": order},
        )
    if not FaqItem.objects.filter(company=company).exists():
        for order, (question, answer) in enumerate(DEFAULT_FAQ):
            FaqItem.objects.create(company=company, question=question, answer=answer, order=order)
