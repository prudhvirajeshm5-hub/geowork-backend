"""
Serves geowork-console.html — the single-file vanilla-JS ops console —
directly from Django so it runs same-origin with the API (no CORS
dependency) in both development and production.
"""
from pathlib import Path

from django.conf import settings
from django.http import Http404, HttpResponse

_CONSOLE_PATH = Path(settings.BASE_DIR) / "geowork-console.html"


def serve_console(request):
    if not _CONSOLE_PATH.exists():
        raise Http404("geowork-console.html not found in project root.")
    return HttpResponse(_CONSOLE_PATH.read_text(encoding="utf-8"), content_type="text/html")