#!/usr/bin/env bash
set -e
echo "=== Running migrations ==="
python manage.py migrate_schemas --shared --noinput
echo "=== Collecting static ==="
python manage.py collectstatic --noinput --clear
echo "=== Launching gunicorn ==="
exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers 4 \
  --worker-class gthread \
  --threads 2 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
