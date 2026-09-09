"""
GeoWork Pro backend settings.

Modules 1-3: Authentication, Company Management, Employee Management.
Multi-tenant: every company-scoped model carries a `company` FK; querysets
are filtered by `request.user.company` in views (see accounts/permissions.py).
"""
import os
from datetime import timedelta
from pathlib import Path

from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config("SECRET_KEY", default="django-insecure-change-me-in-production")
DEBUG = config("DEBUG", default=True, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

# Render sets this automatically for every web service (e.g.
# "geowork-backend.onrender.com") — appending it here means you never have
# to manually chase down and paste your Render URL into ALLOWED_HOSTS by
# hand, which is exactly the kind of step that's caused problems before.
RENDER_EXTERNAL_HOSTNAME = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if RENDER_EXTERNAL_HOSTNAME and RENDER_EXTERNAL_HOSTNAME not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

# Render (and most hosts) terminate HTTPS at a proxy and forward plain HTTP
# internally — without this, Django thinks every request is insecure and
# CSRF/cookie-security checks misbehave behind the proxy.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", default="", cast=Csv())
if RENDER_EXTERNAL_HOSTNAME:
    CSRF_TRUSTED_ORIGINS.append(f"https://{RENDER_EXTERNAL_HOSTNAME}")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.gis",
    # third party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "corsheaders",
    # local apps
    "accounts",
    "companies",
    "employees",
    "geofence",
    "attendance",
    "tracking",
    "dashboard",
    "notifications",
    "reports",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Serves static files (admin CSS/JS etc.) directly from Django in
    # production, since there's no separate static-file server/CDN here —
    # must sit right after SecurityMiddleware.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "geowork_backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "geowork_backend.wsgi.application"

# PostGIS-enabled engine either way: geofence boundaries (Module 4) are
# stored as real spatial geometry and queried with ST_Contains for
# attendance/tracking checks. Requires the `postgis` extension on the
# target database (`CREATE EXTENSION postgis;`).
#
# Render's managed Postgres gives you ONE connection string (DATABASE_URL)
# rather than separate host/user/password fields — this branches on whether
# that's set, so the exact same settings.py works unchanged for local dev
# (DB_* vars in .env) and for Render (DATABASE_URL from its dashboard).
_database_url = config("DATABASE_URL", default="")
if _database_url:
    import dj_database_url

    DATABASES = {"default": dj_database_url.config(default=_database_url, conn_max_age=600)}
    DATABASES["default"]["ENGINE"] = "django.contrib.gis.db.backends.postgis"
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.contrib.gis.db.backends.postgis",
            "NAME": config("DB_NAME", default="geowork"),
            "USER": config("DB_USER", default="postgres"),
            "PASSWORD": config("DB_PASSWORD", default="postgres"),
            "HOST": config("DB_HOST", default="localhost"),
            "PORT": config("DB_PORT", default="5432"),
        }
    }

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Whitenoise: compresses static files and adds cache-busting hashes to
# their filenames, so browsers cache them safely across deploys.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# DRF / JWT
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "accounts.authentication.ForcePasswordChangeJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.AnonRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "user": "1000/hour",
        "anon": "20/hour",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())
CORS_ALLOW_ALL_ORIGINS = DEBUG

# OTP settings
OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 5
OTP_MAX_ATTEMPTS = 5

CELERY_BROKER_URL = config("REDIS_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = config("REDIS_URL", default="redis://localhost:6379/0")

# Geofence debounce (V1.1 requirement #7) — a single noisy GPS reading must
# not flip attendance state. An ENTER is only confirmed once the employee
# has looked like they're inside continuously for this long; an EXIT only
# once they've looked like they're outside continuously for this long.
# Company/work-area-specific overrides can be layered on later; these are
# the global defaults for now.
GEOFENCE_ENTRY_DEBOUNCE_SECONDS = config("GEOFENCE_ENTRY_DEBOUNCE_SECONDS", default=45, cast=int)
GEOFENCE_EXIT_DEBOUNCE_SECONDS = config("GEOFENCE_EXIT_DEBOUNCE_SECONDS", default=180, cast=int)

# GPS accuracy tiers (V1.1 requirement #8), in meters. A ping is HIGH
# accuracy at or below the first threshold, NORMAL up to the second, and
# LOW above it. Poor-accuracy pings still count toward geofence membership
# (rejecting them outright would create its own false exits in areas with
# bad signal) but are surfaced to managers as uncertain rather than acted
# on for immediate boundary crossings — see tracking.services.
GPS_ACCURACY_HIGH_METERS = config("GPS_ACCURACY_HIGH_METERS", default=20, cast=int)
GPS_ACCURACY_NORMAL_METERS = config("GPS_ACCURACY_NORMAL_METERS", default=50, cast=int)

# Live tracking (Module 6)
LIVE_TRACKING_ONLINE_THRESHOLD_MINUTES = config("LIVE_TRACKING_ONLINE_THRESHOLD_MINUTES", default=5, cast=int)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
