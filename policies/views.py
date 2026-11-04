from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FaqItem, Holiday, Policy
from . import services


def _no_company():
    return Response({"detail": "This account is not linked to a company."}, status=400)


class PolicyListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.company_id:
            return _no_company()
        services.ensure_defaults(request.user.company)
        rows = Policy.objects.filter(company=request.user.company)
        return Response({"results": [
            {"slug": p.slug, "title": p.title, "subtitle": p.subtitle, "published": p.is_published}
            for p in rows
        ]})


class PolicyDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        if not request.user.company_id:
            return _no_company()
        services.ensure_defaults(request.user.company)
        policy = Policy.objects.filter(company=request.user.company, slug=slug).first()
        if policy is None:
            return Response({"detail": "Not found."}, status=404)
        if not policy.is_published:
            return Response({"title": policy.title, "subtitle": policy.subtitle, "published": False, "body": ""})
        return Response({
            "title": policy.title,
            "subtitle": policy.subtitle,
            "published": True,
            "body": policy.body,
            "updated_at": policy.updated_at.isoformat(),
        })


class HolidayListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.company_id:
            return _no_company()
        try:
            year = int(request.query_params.get("year", timezone.localdate().year))
        except ValueError:
            return Response({"detail": "year must be a number."}, status=400)
        rows = Holiday.objects.filter(company=request.user.company, date__year=year)
        return Response({"year": year, "results": [{"date": str(h.date), "name": h.name} for h in rows]})


class FaqListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.company_id:
            return _no_company()
        services.ensure_defaults(request.user.company)
        rows = FaqItem.objects.filter(company=request.user.company, is_published=True)
        return Response({"results": [{"question": f.question, "answer": f.answer} for f in rows]})


# ---- Admin management (added for the Policies page) ----
import datetime as _dt  # noqa: E402

from django.utils.text import slugify  # noqa: E402
from rest_framework import status as _status  # noqa: E402
from accounts.permissions import IsCompanyAdmin  # noqa: E402


def _policy_dict(p):
    return {
        "slug": p.slug,
        "title": p.title,
        "subtitle": p.subtitle,
        "body": p.body,
        "published": p.is_published,
        "updated_at": p.updated_at.isoformat(),
    }


def _unique_slug(company, title):
    base = slugify(title)[:50] or "policy"
    slug, n = base, 2
    while Policy.objects.filter(company=company, slug=slug).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug


class PolicyManageView(APIView):
    """Admin: every policy in the company (including drafts), and create a new one."""

    permission_classes = [IsAuthenticated, IsCompanyAdmin]

    def get(self, request):
        rows = Policy.objects.filter(company=request.user.company)
        return Response({"results": [_policy_dict(p) for p in rows]})

    def post(self, request):
        title = str(request.data.get("title") or "").strip()
        if not title:
            return Response({"detail": "Enter a title for the policy."}, status=400)
        company = request.user.company
        policy = Policy.objects.create(
            company=company,
            slug=_unique_slug(company, title),
            title=title[:120],
            subtitle=str(request.data.get("subtitle") or "").strip()[:160],
            body=str(request.data.get("body") or ""),
            is_published=bool(request.data.get("published", False)),
        )
        return Response(_policy_dict(policy), status=_status.HTTP_201_CREATED)


class PolicyManageDetailView(APIView):
    """Admin: change a policy's title, subtitle, text or published state."""

    permission_classes = [IsAuthenticated, IsCompanyAdmin]

    def patch(self, request, slug):
        policy = Policy.objects.filter(company=request.user.company, slug=slug).first()
        if policy is None:
            return Response({"detail": "Not found."}, status=404)
        if "title" in request.data:
            title = str(request.data.get("title") or "").strip()
            if not title:
                return Response({"detail": "The title can't be empty."}, status=400)
            policy.title = title[:120]
        if "subtitle" in request.data:
            policy.subtitle = str(request.data.get("subtitle") or "").strip()[:160]
        if "body" in request.data:
            policy.body = str(request.data.get("body") or "")
        if "published" in request.data:
            policy.is_published = bool(request.data.get("published"))
        policy.save()
        return Response(_policy_dict(policy))


class HolidayManageView(APIView):
    """Admin: holidays for a year, and add a holiday."""

    permission_classes = [IsAuthenticated, IsCompanyAdmin]

    def get(self, request):
        try:
            year = int(request.query_params.get("year") or _dt.date.today().year)
        except ValueError:
            return Response({"detail": "year must be a number."}, status=400)
        rows = Holiday.objects.filter(company=request.user.company, date__year=year)
        return Response({"year": year, "results": [{"id": h.id, "date": str(h.date), "name": h.name} for h in rows]})

    def post(self, request):
        name = str(request.data.get("name") or "").strip()
        try:
            day = _dt.date.fromisoformat(str(request.data.get("date") or ""))
        except ValueError:
            return Response({"detail": "Choose a valid date."}, status=400)
        if not name:
            return Response({"detail": "Enter the holiday's name."}, status=400)
        company = request.user.company
        if Holiday.objects.filter(company=company, date=day).exists():
            return Response({"detail": "A holiday is already set for this date."}, status=400)
        holiday = Holiday.objects.create(company=company, date=day, name=name[:120])
        return Response({"id": holiday.id, "date": str(holiday.date), "name": holiday.name}, status=_status.HTTP_201_CREATED)


class HolidayManageDetailView(APIView):
    """Admin: remove a holiday."""

    permission_classes = [IsAuthenticated, IsCompanyAdmin]

    def delete(self, request, pk):
        holiday = Holiday.objects.filter(company=request.user.company, pk=pk).first()
        if holiday is None:
            return Response({"detail": "Not found."}, status=404)
        holiday.delete()
        return Response(status=_status.HTTP_204_NO_CONTENT)


class FaqManageView(APIView):
    """Admin: every FAQ item (including unpublished), and add one."""

    permission_classes = [IsAuthenticated, IsCompanyAdmin]

    def get(self, request):
        rows = FaqItem.objects.filter(company=request.user.company)
        return Response({"results": [
            {"id": f.id, "question": f.question, "answer": f.answer, "published": f.is_published}
            for f in rows
        ]})

    def post(self, request):
        question = str(request.data.get("question") or "").strip()
        answer = str(request.data.get("answer") or "").strip()
        if not question or not answer:
            return Response({"detail": "Enter both the question and the answer."}, status=400)
        company = request.user.company
        item = FaqItem.objects.create(
            company=company,
            question=question[:200],
            answer=answer,
            is_published=bool(request.data.get("published", True)),
            order=FaqItem.objects.filter(company=company).count(),
        )
        return Response(
            {"id": item.id, "question": item.question, "answer": item.answer, "published": item.is_published},
            status=_status.HTTP_201_CREATED,
        )


class FaqManageDetailView(APIView):
    """Admin: change or remove an FAQ item."""

    permission_classes = [IsAuthenticated, IsCompanyAdmin]

    def patch(self, request, pk):
        item = FaqItem.objects.filter(company=request.user.company, pk=pk).first()
        if item is None:
            return Response({"detail": "Not found."}, status=404)
        if "question" in request.data:
            question = str(request.data.get("question") or "").strip()
            if not question:
                return Response({"detail": "The question can't be empty."}, status=400)
            item.question = question[:200]
        if "answer" in request.data:
            answer = str(request.data.get("answer") or "").strip()
            if not answer:
                return Response({"detail": "The answer can't be empty."}, status=400)
            item.answer = answer
        if "published" in request.data:
            item.is_published = bool(request.data.get("published"))
        item.save()
        return Response({"id": item.id, "question": item.question, "answer": item.answer, "published": item.is_published})

    def delete(self, request, pk):
        item = FaqItem.objects.filter(company=request.user.company, pk=pk).first()
        if item is None:
            return Response({"detail": "Not found."}, status=404)
        item.delete()
        return Response(status=_status.HTTP_204_NO_CONTENT)

