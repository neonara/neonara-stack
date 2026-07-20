FROM python:3.12-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y \
    build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*
COPY requirements/ requirements/
RUN pip install --no-cache-dir -r requirements/base.txt

FROM base AS production
ENV DJANGO_SETTINGS_MODULE=config.settings.production
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
COPY . .
RUN chmod +x entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]

FROM base AS development
ENV DJANGO_SETTINGS_MODULE=config.settings.development
RUN pip install --no-cache-dir -r requirements/development.txt
COPY . .
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
