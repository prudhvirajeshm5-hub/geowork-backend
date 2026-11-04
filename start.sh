#!/bin/sh
set -e
python manage.py migrate --noinput
if [ -n "$DJANGO_SUPERUSER_PHONE" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  python manage.py createsuperuser --noinput || echo "Superuser already exists, skipping."
fi
exec gunicorn geowork_backend.wsgi:application --bind 0.0.0.0:${PORT:-10000} --workers 2 --timeout 120
