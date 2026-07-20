# Neonara Stack

A multi-tenant SaaS starter template: a decoupled Django REST/GraphQL backend
paired with a Next.js 15 frontend, built for spinning up new client projects
on a consistent architecture.

## Architecture

### Backend (`backend/`)

- **Django 5.x** + **DRF 3.15** for REST (`/api/v1/`), **Graphene-Django** for
  GraphQL (`/graphql/`)
- **django-tenants** for multi-tenancy using application-level row isolation
  (all tenants share one PostgreSQL schema; rows are filtered by a
  `tenant_schema` column — NOT schema-per-tenant)
- **Celery** with RabbitMQ broker and named queues: `default`, `scoring`,
  `pdf`, `email`, `notif`
- **simplejwt** for JWT auth
- Apps live under `backend/apps/`: `tenants`, `users`, `audit`
- Shared code lives under `backend/core/`: `permissions/`, `middleware/`,
  `cache/`, `health/`
- Django admin at `/admin/`, health check at `/api/health/`

### Frontend (`frontend/`)

- **Next.js 15** App Router with React 19, TypeScript, Tailwind CSS
- **next-intl** for i18n (en, fr, ar) — pages live under `app/[locale]/`
- Session stored in an httpOnly cookie (`app_session`, a signed JWT); the
  browser never talks to Django directly — it calls Next.js API routes under
  `app/api/auth/*`, which hold the real Django access/refresh tokens
- `middleware.ts` guards authenticated routes and handles locale routing;
  public paths: `/login`, `/register`, `/otp`, `/api/auth`
- Tenant branding applied via CSS custom properties (`tailwind.config.ts`)

### Infrastructure

Full stack via `docker-compose.yml`: `django_api` (8000), `celery_worker`,
`celery_beat`, `postgres`, `redis`, `rabbitmq`, `gotenberg` (HTML→PDF, port
3030), `portainer` (9443), `frontend` (3000).

## Getting started

### Docker (recommended)

```bash
cp .env.example .env   # fill in real values before starting
docker compose --env-file .env up -d
docker compose exec django_api python manage.py migrate_schemas --shared
docker compose exec django_api python manage.py createsuperuser
```

### Backend (local)

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements/development.txt

# Always use migrate_schemas — never plain `migrate`
python manage.py migrate_schemas --shared        # public schema (shared apps)
python manage.py migrate_schemas                 # all tenant schemas
python manage.py migrate_schemas --schema=<name>  # single tenant

python manage.py runserver

# Celery
celery -A config worker --loglevel=info
celery -A config beat --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

### Frontend (local)

```bash
cd frontend
cp .env.local.example .env.local   # set NEXT_SESSION_SECRET, API URLs
npm install
npm run dev          # http://localhost:3000
```

## Testing

```bash
# Backend
cd backend && pytest

# Frontend
cd frontend && npm run test
```

## Code quality

```bash
# Backend
black . && isort . && flake8 && mypy .

# Frontend
npm run lint && npm run type-check
```

## CI/CD

`.github/workflows/ci-cd.yml` runs on every push/PR:

1. Backend lint & types (black, isort, flake8, mypy)
2. Backend tests & coverage (pytest against a Postgres service container)
3. Frontend lint & types (eslint, tsc)
4. Frontend unit tests (vitest)
5. Frontend build (`next build`) — on `main`/PRs only
6. Security scan (trivy, bandit, safety, pip-audit, npm audit)
7. Backend image build & push to GHCR — on `main`/PRs only
8. Deploy over SSH — on pushes to `main` only, and only once the
   `SSH_HOST`/`SSH_USER`/`SSH_PRIVATE_KEY`/`DEPLOY_PATH` repo secrets are set
   (otherwise it runs in dry-run mode and reports what's missing)

`.github/workflows/code-quality.yml` runs SonarCloud static analysis for both
projects — inactive until you set a real `sonar.organization` (replace
`YOUR_SONARCLOUD_ORG` in that file) and add a `SONAR_TOKEN` repo secret.

## Critical gotchas

1. **Multi-tenancy is row-level, not schema-per-tenant.** Stamp
   `tenant_schema` from the authenticated user on create; filter by it (+
   role) in every queryset; never accept it from client input.
2. **Never run `python manage.py migrate`** — always `migrate_schemas`.
3. **Trailing slashes** are required on all API routes.
4. A new Django app goes in **either** `SHARED_APPS` **or** `TENANT_APPS` in
   `config/settings/base.py`, never both.
5. Don't commit `.env*` or secrets.

## Known gaps

- `frontend/Dockerfile` doesn't exist yet — `docker-compose.yml` references a
  `frontend` build context that needs one before `docker compose up` will
  build it. CI only builds/pushes the backend image for the same reason.
- `.env.example` at the repo root is incomplete past the RabbitMQ section —
  fill in the remaining variables referenced in `config/settings/base.py`
  (SMTP, OAuth providers, Cloudinary) before deploying.
