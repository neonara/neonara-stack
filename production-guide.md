# Production deployment guide

How we take a Dockerized web app to production on a single VPS: GitHub Actions builds the images, a
VPS runs them with Docker Compose behind Nginx Proxy Manager (NPM), and a cron script keeps backups.

It is written from the EduEvent deployment (Django API + Next.js frontend + Postgres, Redis, RabbitMQ,
MinIO, ClamAV), but the steps apply to any app with the same shape. EduEvent-specific values are
marked *(EduEvent)*; replace them with your app's own.

> **Never put real secrets in this file, in chat, in a ticket or in a commit.** Passwords, API keys
> and tokens live in two places only: the VPS `.env` and GitHub Actions secrets. If one is ever pasted
> somewhere else, treat it as leaked and rotate it ([§9.1](#91-rotating-secrets)).

## Contents

1. [Architecture](#1-architecture)
2. [Prerequisites](#2-prerequisites)
3. [CI/CD: GitHub Actions](#3-cicd-github-actions)
4. [The VPS](#4-the-vps)
5. [Reverse proxy and HTTPS: Nginx Proxy Manager](#5-reverse-proxy-and-https-nginx-proxy-manager)
6. [No domain yet? Use sslip.io](#6-no-domain-yet-use-sslipio)
7. [First deploy and first admin account](#7-first-deploy-and-first-admin-account)
8. [Backups](#8-backups)
9. [Security hardening](#9-security-hardening)
10. [Day-to-day operations](#10-day-to-day-operations)
11. [Troubleshooting: problems we actually hit](#11-troubleshooting-problems-we-actually-hit)
12. [Checklist for a new app](#12-checklist-for-a-new-app)

---

## 1. Architecture

```
                    GitHub (push to `prod`)
                            │
                 GitHub Actions: build images
                            │  push
                            ▼
                ghcr.io/<org>/<app>-backend:prod-<sha>
                ghcr.io/<org>/<app>-frontend:prod-<sha>
                            │  SSH: pull + compose up + migrate + health check
                            ▼
 Internet ──80/443──▶ ┌──────────── VPS (Docker Compose) ─────────────┐
                      │  npm (Nginx Proxy Manager, TLS/Let's Encrypt)  │
                      │    ├─ /                → frontend:3000        │
                      │    ├─ /api/v1, /admin… → django-api:8000      │
                      │    ├─ /ws/             → django-api:8000 (WS) │
                      │    └─ /<bucket>/       → minio:9000 (files)   │
                      │  postgres · redis · rabbitmq · minio · clamav │
                      │  celery_worker · celery_beat                   │
                      └────────────────────────────────────────────────┘
```

Key rules:

- **Only NPM publishes ports** (80, 443, and 81 bound to `127.0.0.1`). Every other container is
  reachable only inside Docker. A published `8000`/`3000`/`9000` bypasses the proxy, the TLS and the
  firewall (Docker publishes ports around `ufw`).
- **One public origin.** The browser talks to `https://<domain>` only; NPM splits paths between the
  frontend, the API and file storage. No CORS, no extra ports.
- **Images are built once, in CI**, and the server only pulls them. Nothing is built on the VPS.

## 2. Prerequisites

| What | Notes |
|---|---|
| VPS | Ubuntu 24.04, 4 GB RAM minimum (ClamAV alone needs ~1.5–2 GB), Docker + Compose plugin |
| A non-root user | e.g. `deploy`, in the `docker` group, SSH key login |
| GitHub repo | with Actions enabled and GHCR (GitHub Container Registry) |
| A domain | optional at first: see [§6](#6-no-domain-yet-use-sslipio) |
| SMTP account | if the app sends email (EduEvent's login needs it: every login sends a code) |

## 3. CI/CD: GitHub Actions

### 3.1 Branches

| Branch | What happens on push |
|---|---|
| any | lint + tests (`.github/workflows/ci-cd.yml`) |
| `master` | + build images + deploy to the master server |
| `prod` | build `prod-<sha>` images + deploy to production (`.github/workflows/deploy-prod.yml`) |

Production is deployed by merging into `prod` and pushing. Never edit code on the server.

### 3.2 What the prod workflow does

`.github/workflows/deploy-prod.yml`, two jobs:

1. **Build & push** backend and frontend images to GHCR, tagged `prod-<commit sha>` and `prod`.
   The frontend gets its public URL **baked in at build time** (`NEXT_PUBLIC_API_URL` build arg).
2. **Deploy over SSH**:
   - `docker login ghcr.io`
   - `docker compose pull` the app services only (`django_api celery_worker celery_beat frontend`)
   - re-tag the pulled images as `:prod` on the server, so a later manual `docker compose up` runs
     the same code (see [§11](#11-troubleshooting-problems-we-actually-hit), "old image")
   - `docker compose up -d --no-build` those services
   - `migrate` + `collectstatic`
   - health check `GET /api/health/` from inside the container; on failure, print the API logs and
     fail the job

It uses `concurrency: deploy-prod` with `cancel-in-progress: false`: a production deploy is never
cancelled half-way; the next one queues.

### 3.3 GitHub secrets and variables

Settings → Secrets and variables → Actions. **App secrets (DB passwords, API keys, SMTP…) do NOT go
here** — they live only in the VPS `.env`. GitHub only needs what it takes to build and to reach the
server:

| Name | Type | Value |
|---|---|---|
| `SSH_HOST_PROD` | secret | VPS IP |
| `SSH_USER` | secret | `deploy` |
| `SSH_PRIVATE_KEY_PROD` | secret | private key whose public half is in `~deploy/.ssh/authorized_keys` |
| `SSH_PORT` | secret, optional | default 22 |
| `DEPLOY_PATH_PROD` | secret | folder on the VPS with `docker-compose.yml` + `.env`, e.g. `/var/www/bmg` |
| `GHCR_TOKEN` | secret | token with `read:packages` (only if the images are private) |
| `NEXT_PUBLIC_API_URL_PROD` | **variable** | public URL, e.g. `https://example.com` — no trailing `/api` |

`NEXT_PUBLIC_API_URL_PROD` is a *variable*, not a secret: it ends up in the browser anyway. The
workflow reads the secret first, then the variable — if both exist, the secret wins, so keep only one.

**Changing the public URL = rebuilding the frontend.** Update the variable, then push to `prod`.

## 4. The VPS

### 4.1 Folder layout

```
/var/www/bmg/                 # = DEPLOY_PATH_PROD
├── docker-compose.yml        # production compose (NOT the repo's dev compose)
├── .env                      # all runtime secrets/config — chmod 600, never committed
├── backup.sh                 # backups (§8)
├── backups/                  # backup output, root-only (chmod 700)
├── npm/data, npm/letsencrypt # NPM config + certificates
├── postgres/init, postgres/backups
├── redis, rabbitmq
```

### 4.2 Production `docker-compose.yml` — the important parts

The repo's `docker-compose.yml` is for **local development** (builds from source, `development`
target, publishes ports). The VPS has its own compose file. Its essentials:

```yaml
networks:
  frontend_net:
  backend_net:
  data_net:
    internal: true            # databases: no internet, no host access

services:
  npm:
    image: jc21/nginx-proxy-manager:2.12.3     # pin a version, not :latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "127.0.0.1:81:81"     # admin UI: localhost only, use an SSH tunnel
    volumes:
      - ./npm/data:/data
      - ./npm/letsencrypt:/etc/letsencrypt
    networks: [frontend_net, backend_net]

  frontend:
    image: ${FRONTEND_IMAGE:-ghcr.io/<org>/<app>-frontend:prod}
    restart: unless-stopped
    expose: ["3000"]          # no `ports:`
    env_file: .env
    networks: [frontend_net, backend_net]

  django_api:
    image: ${BACKEND_IMAGE:-ghcr.io/<org>/<app>-backend:prod}
    restart: unless-stopped
    expose: ["8000"]          # no `ports:` — Django trusts X-Forwarded-Proto, so it must sit behind the proxy
    env_file: .env
    networks:
      frontend_net:
      backend_net: { aliases: [django-api] }   # hostname with a dash: Django rejects `_` in Host
      data_net:    { aliases: [django-api] }
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health/')"]

  minio:
    image: ghcr.io/<org>/minio:RELEASE.2025-09-07T16-13-09Z   # our own mirror, see §11
    networks: [data_net, backend_net]

  clamav:                     # (EduEvent) upload virus scan — uploads fail with 503 without it
    image: clamav/clamav:stable
    volumes: [clamav_data:/var/lib/clamav]
    networks: [backend_net]   # needs internet for virus definition updates

  # postgres, redis, rabbitmq: on data_net only, with healthchecks
  # celery_worker, celery_beat: same image as django_api, on backend_net + data_net
```

Rules of thumb:

- **Pin every image version.** `:latest` can pull a breaking change on any restart.
- **`restart: unless-stopped`** on everything, so the stack survives reboots.
- **Healthchecks** on the API and the databases, and `depends_on: condition: service_healthy`.
- **Never publish database or app ports.**

### 4.3 `.env` — the values that broke things

| Variable | Correct form | Wrong form we had, and what it broke |
|---|---|---|
| `ALLOWED_HOSTS` | `example.com,www.example.com,django-api,localhost` | `https://example.com` (scheme) → every request 400. Missing `localhost` → container healthcheck fails. Missing `django-api` → frontend server-side calls fail |
| `CSRF_TRUSTED_ORIGINS` | `https://example.com,https://www.example.com` (scheme required) | missing → Django admin login 403 behind HTTPS |
| `FRONTEND_URL` | `https://example.com` | `:3000` → broken links in emails |
| `TENANT_BASE_DOMAIN` *(EduEvent)* | `example.com` | with `https://` → `school.https://example.com` |
| `NEXT_PUBLIC_API_URL` | `https://example.com` | `:8000` → plain HTTP behind an HTTPS page; also baked at build, see §3.3 |
| `INTERNAL_API_URL` | `http://django-api:8000` | missing → frontend server calls go out to the internet and back |
| `MINIO_PUBLIC_ENDPOINT` | `example.com` (no scheme, no port) | `https://…:9000` → `http://https://…` links |
| `MINIO_USE_SSL` | `True` once HTTPS works | `False` → file links in `http://` on an HTTPS page |
| `COOKIE_INSECURE` | **absent** in production | `true` → session cookie sent over plain HTTP. Only acceptable temporarily, before HTTPS works |
| `FIELD_ENCRYPTION_KEYS` *(EduEvent)* | **never change once data exists** | changing it makes encrypted medical records unreadable. Keep a copy outside the VPS |

`.env` may contain characters like `(` `>` `$` in passwords: Docker Compose reads them fine, but
**`source .env` in bash does not** — scripts must never source it (see §8).

Generate passwords with `openssl rand -hex 32`: hex never needs escaping in URLs such as
`REDIS_URL` / `RABBITMQ_URL`. Use a different value for every secret (`SECRET_KEY` ≠
`NEXT_SESSION_SECRET` ≠ DB password…).

## 5. Reverse proxy and HTTPS: Nginx Proxy Manager

### 5.1 Open the admin UI

Port 81 is bound to the VPS's localhost only. From your PC:

```bash
ssh -L 8181:127.0.0.1:81 deploy@<VPS_IP>      # keep this terminal open
```

Then open `http://localhost:8181` (8181 locally: ports below 1024 need root on Linux). First login
asks you to create the admin account — use a strong password.

> `http://<VPS_IP>` (port 80) shows NPM's public "Congratulations / Default Site" page. That is
> **not** the admin UI; it means "no proxy host matches this name".

### 5.2 Create the proxy host

Hosts → Proxy Hosts → Add Proxy Host.

**Details**

- Domain names: `example.com`, `www.example.com` — type each one and press **Enter** so it becomes a
  tag; text not turned into a tag is not saved.
- Scheme: **`http`** (how NPM talks to the container, not what visitors use)
- Forward hostname: `frontend`, port `3000`
- Block Common Exploits: on · Websockets Support: on

**Advanced** — path routing. Hostnames are the **compose service names/aliases** of *this* stack
(`django-api`, `minio`, `frontend`), never names copied from another project:

```nginx
client_max_body_size 10m;

# Django: REST API, health, GraphQL, schema/docs, admin, static, media
location ~ ^/(api/(v1|health|graphql|schema|docs)|admin|static|media)/ {
    proxy_pass http://django-api:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Django Channels WebSockets
location /ws/ {
    proxy_pass http://django-api:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
}

# Uploaded files (MinIO, public-read bucket). Path = MINIO_BUCKET_NAME.
location /eduevent/ {
    proxy_pass http://minio:9000;
    proxy_set_header Host minio:9000;
}
```

Every other path, **including the Next.js BFF under `/api/auth/*`, `/api/client/*`…**, goes to the
frontend (the default location). Never send all of `/api/` to Django.

**SSL** — leave it on *None* for the first save. Save, then check:

```bash
docker compose exec npm nginx -t                           # "test is successful"
curl -s http://example.com/api/health/                     # {"status":"ok","db":"ok","cache":"ok"}
```

Then edit the host → SSL → *Request a new SSL Certificate* → Force SSL, HTTP/2 (HSTS only on a
permanent domain) → Save.

### 5.3 Let's Encrypt only works when DNS resolves

Before requesting a certificate, `dig +short example.com` must print the VPS IP. Otherwise the
request fails with NPM's generic "Internal Error" and `Some challenges have failed` in the logs.
Let's Encrypt blocks a hostname after ~5 failed attempts per hour, so don't retry in a loop.

DNS records (at the registrar — DNS is never configured in NPM):

| Type | Name | Value |
|---|---|---|
| A | `@` | `<VPS_IP>` |
| A | `www` | `<VPS_IP>` |

`NXDOMAIN` from `dig` means the domain itself doesn't exist in DNS yet (not registered, not active,
or no nameservers) — fix it at the registrar.

## 6. No domain yet? Use sslip.io

[sslip.io](https://sslip.io) is a free public DNS service: `<a>-<b>-<c>-<d>.sslip.io` resolves to the
IP `a.b.c.d`. It gives a real hostname, so NPM routing **and Let's Encrypt HTTPS** work before the
real domain is ready.

Example for VPS `193.70.43.160`: **`193-70-43-160.sslip.io`** (dashes, all four parts — a missing
digit points to someone else's server; we lost an afternoon to `93-70-…`).

```bash
dig +short 193-70-43-160.sslip.io        # → 193.70.43.160
```

Use it exactly like a real domain:

1. `.env`: replace the domain everywhere ([§4.3](#43-env--the-values-that-broke-things)):
   `ALLOWED_HOSTS=193-70-43-160.sslip.io,django-api,localhost`,
   `CSRF_TRUSTED_ORIGINS=https://193-70-43-160.sslip.io`, `FRONTEND_URL`, `MINIO_PUBLIC_ENDPOINT`…
2. GitHub variable `NEXT_PUBLIC_API_URL_PROD=https://193-70-43-160.sslip.io`, then push to `prod`
   to rebuild the frontend.
3. NPM proxy host for `193-70-43-160.sslip.io`, then request the certificate. Leave **HSTS off**:
   the hostname is temporary.

Why not just `http://<IP>:3000`? The app needs one origin that routes `/api/v1`, `/ws` and files
(§5.2), and the session cookie is `Secure` (HTTPS only) in production — over plain HTTP the browser
drops it and the login loops back to the login page.

**Switching to the real domain later**: DNS A records → `.env` values → GitHub variable → push to
`prod` → add the domain to the NPM proxy host and request its certificate. No code change needed:
the frontend's image allowlist follows `NEXT_PUBLIC_API_URL` (`frontend/next.config.ts`).

## 7. First deploy and first admin account

### 7.1 First deploy on a fresh server

```bash
cd /var/www/bmg
docker compose pull                 # every image must pull without "access denied"
docker compose up -d                # starts everything, including NPM
docker compose ps                   # all running; API, DB, Redis, RabbitMQ, MinIO "healthy"
```

NPM depends on the frontend, which waits for a healthy API: **if the API is unhealthy, NPM never
starts** and ports 80/443 refuse connections. Fix the API first (§11).

After the first manual start, every later deploy is just a push to `prod`.

### 7.2 Create the first super admin *(EduEvent)*

```bash
docker compose exec -T django_api python manage.py shell <<'EOF'
from apps.users.models import User
email = 'admin@example.com'                     # lowercase
user, created = User.objects.get_or_create(email=email, defaults={'role': 'super_admin'})
user.role = 'super_admin'
user.is_staff = user.is_superuser = True
user.is_admin_support = False                   # full super admin
user.status = 'active'
user.set_password('<temporary strong password, 10+ chars>')
user.save()
print('created' if created else 'updated', user.email)
EOF
```

Login is two-step: password, then a 6-digit code by email. So SMTP and `celery_worker` must work
before anyone can log in. The person then changes the password from their profile.

## 8. Backups

Backups are kept **on the VPS** in `/var/www/bmg/backups/<date>/` by `backup.sh`, run nightly by cron.

### 8.1 What is backed up

| Data | How | Why |
|---|---|---|
| PostgreSQL | `pg_dump -Fc` (consistent while running) | all business data — critical |
| MinIO volume | `tar` of the volume | uploaded files — critical |
| `npm/` | `tar` | proxy hosts + certificates |
| `.env` | copy, `chmod 600` | every secret, incl. encryption keys |
| Redis, RabbitMQ | not backed up | cache and in-flight messages, rebuilt on start |

### 8.2 The script

Lives at `/var/www/bmg/backup.sh` (`chmod 700`). Commands:

```bash
sudo ./backup.sh run                       # new backup
sudo ./backup.sh list                      # backups, sizes, disk usage
sudo ./backup.sh restore-db <name>         # e.g. 2026-10-02_0330 — asks "yes", backs up the current state first
sudo ./backup.sh restore-files <name>      # restores MinIO files
```

Design points worth keeping in any backup script:

- **Never `source .env`** — bash breaks on special characters in passwords. Read DB credentials
  inside the container instead: `docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"'`
  (single quotes: the variables expand in the container).
- Write to `<name>.partial`, rename when complete — a failed run never looks like a good backup.
- Refuse to run above 90% disk usage.
- Retention: delete backups older than `KEEP_DAYS` (default 14).
- Restores ask for confirmation and take a safety backup first.
- MinIO volume name = `<compose project>_minio_data` (project = folder name, e.g. `bmg_minio_data`;
  check with `docker volume ls`).

### 8.3 Schedule

```bash
sudo crontab -e
30 3 * * * /var/www/bmg/backup.sh run >> /var/log/app-backup.log 2>&1
```

Check it with `tail /var/log/app-backup.log` and `sudo ./backup.sh list`.

### 8.4 Limits — read this

Local backups protect against a bad migration, deleted data or a broken deploy. They **do not**
protect against losing the VPS. At least monthly, copy the latest backup off the server (your PC,
or an object storage with `restic`). **Test a restore** on a scratch server periodically: a backup
never restored is a guess.

## 9. Security hardening

Do these one at a time, verifying after each.

### 9.1 Rotating secrets

Any secret seen outside `.env`/GitHub secrets is leaked. For each:

| Secret | How |
|---|---|
| Third-party keys (payment, AI, SMTP) | regenerate in the provider's dashboard, delete the old one |
| `SECRET_KEY`, session secret | new value in `.env` (everyone is logged out once) |
| Postgres password | `ALTER USER <user> PASSWORD '<new>';` **first**, then `.env` (the env var only applies when the DB is first created) |
| Redis / RabbitMQ | `.env` password **and** the password inside `REDIS_URL` / `RABBITMQ_URL` |
| GitHub personal tokens | GitHub → Settings → Developer settings → delete |

Then `docker compose up -d --force-recreate` and check health, logs and a test email.

### 9.2 SSH

```bash
# on your PC: ensure key login works first
ssh-copy-id deploy@<VPS_IP> && ssh deploy@<VPS_IP>

# on the VPS
sudo tee /etc/ssh/sshd_config.d/00-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
MaxAuthTries 3
EOF
sudo sshd -t && sudo systemctl restart ssh
```

The file must be named `00-…`: Ubuntu's `50-cloud-init.conf` enables passwords, and sshd keeps the
**first** value it reads. Keep your session open and test from a second terminal.

### 9.3 fail2ban, firewall, updates, logs

```bash
sudo apt install -y fail2ban unattended-upgrades
sudo tee /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
backend = systemd
[sshd]
enabled = true
EOF
sudo systemctl enable --now fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades
sudo ufw allow 22,80,443/tcp && sudo ufw enable
```

Docker log rotation (otherwise logs fill the disk) — `/etc/docker/daemon.json`, then restart Docker:

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
```

### 9.4 Admin tools

Portainer, Flower, NPM admin: never publish their ports. Use an SSH tunnel
(`ssh -L <local>:<container-or-127.0.0.1>:<port> deploy@<VPS_IP>`) or an NPM proxy host with an
access list. Portainer mounts `docker.sock` (= root on the host): remove it if you don't need it.

## 10. Day-to-day operations

| Task | Command / action |
|---|---|
| Deploy | merge into `prod`, push |
| Watch a deploy | GitHub → Actions → Deploy Prod |
| Re-run a failed deploy | Actions → the run → Re-run all jobs |
| Status | `docker compose ps` |
| Logs | `docker compose logs --tail=100 -f django_api` |
| Restart one service | `docker compose up -d --force-recreate <service>` |
| After editing `.env` | `docker compose up -d --force-recreate <services that use it>` |
| Manual update to latest | `docker compose pull <services> && docker compose up -d <services>` |
| Rollback | `BACKEND_IMAGE=ghcr.io/<org>/<app>-backend:prod-<old sha> FRONTEND_IMAGE=…:prod-<old sha> docker compose up -d django_api celery_worker celery_beat frontend` (restore the DB too if the bad version migrated it) |
| Backup now | `sudo ./backup.sh run` (before any risky change) |
| Uptime monitoring | external check on `https://<domain>/api/health/` (UptimeRobot, Uptime Kuma) |

## 11. Troubleshooting: problems we actually hit

| Symptom | Cause | Fix |
|---|---|---|
| `pull access denied for minio/minio` | MinIO stopped publishing images (Docker Hub, then quay.io → `401`) | Mirror the image into our own GHCR (`docker tag` + `docker push ghcr.io/<org>/minio:<version>`) and use that. Long term: plan a maintained S3-compatible server (SeaweedFS, RustFS) |
| Deploy: `dependency failed to start: container …django_api is unhealthy` | `ALLOWED_HOSTS` without `localhost` — the healthcheck's request gets `400 DisallowedHost` | add `localhost` and `django-api` to `ALLOWED_HOSTS`; check `docker compose logs django_api` for `Invalid HTTP_HOST` |
| `IntegrityError: null value in column "…" violates not-null constraint` from a manage.py command | container runs an **old image** against a **newer, migrated** DB: a manual `up` reused a stale local `:prod` tag | `docker compose pull <services> && docker compose up -d <services>`. The workflow now re-tags `:prod` on each deploy |
| `This site can't be reached` / `Connection refused` on 80/443 | NPM container not running (it waits for a healthy API) | fix the API, then `docker compose up -d` |
| `ERR_CONNECTION_TIMED_OUT` on `:3000` / `:8000` | ports intentionally not published / firewalled | go through NPM on 80/443 |
| NPM shows "Default Site" / 404 for your hostname | no proxy host for that exact name, or its config failed to load | `docker compose exec npm nginx -t`; check the domain tag is saved and spelled right |
| `nginx: [emerg] host not found in upstream "backend"` | Advanced block uses a hostname that doesn't exist in this stack | use this stack's names (`django-api`, `minio`, `frontend`) |
| NPM "Internal Error" when saving with SSL | Let's Encrypt can't validate: DNS doesn't resolve, wrong hostname | save without SSL, fix DNS (`dig`), request the certificate once |
| `ERR_SSL_UNRECOGNIZED_NAME_ALERT` | HTTPS request for a hostname NPM has no certificate for | create the proxy host + certificate for that exact name |
| Login: code accepted but back on the login page | site on `http://`, session cookie is `Secure` → dropped by the browser | use HTTPS (or `COOKIE_INSECURE=true` temporarily) |
| Login: `401` "Code invalide ou expiré." while `last_login` was updated | the OTP form auto-submits at 6 digits; a second click resubmits an already-used code | type the latest code and don't click Verify; check `last_login` to know if the first submit worked |
| Uploads fail with 503 *(EduEvent)* | ClamAV container missing or not ready (scanner is fail-closed) | add the `clamav` service; wait for `socket found, clamd started` |
| `./.env: line N: syntax error near unexpected token '('` | a script runs `source .env` | don't source `.env` in scripts (§8.2) |
| Deploy log flooded with `Extracting 1B` | Docker progress bars | `pull -q` / `up --quiet-pull` (already in the workflow) |

General method: `docker compose ps` → `docker compose logs --tail=100 <service>` → reproduce the exact
request with `curl` from your PC and from inside the container. The real error is almost always in
one of those three.

## 12. Checklist for a new app

**Repository**

- [ ] Production Dockerfile target, no dev dependencies, starts with migrations + server
- [ ] `/api/health/` endpoint checking DB + cache
- [ ] Deploy workflow: build → push `prod-<sha>` → SSH pull + up + migrate + health check
- [ ] Public URL as a build arg/variable, never hard-coded; image allowlist derived from it
- [ ] Settings behind a proxy: `SECURE_PROXY_SSL_HEADER`, `CSRF_TRUSTED_ORIGINS` from env

**GitHub**

- [ ] `SSH_HOST_PROD`, `SSH_USER`, `SSH_PRIVATE_KEY_PROD`, `DEPLOY_PATH_PROD`, `GHCR_TOKEN`
- [ ] variable `NEXT_PUBLIC_API_URL_PROD` (or your app's public URL variable)

**VPS**

- [ ] `deploy` user, SSH keys only, fail2ban, unattended-upgrades, ufw (22/80/443), log rotation
- [ ] production `docker-compose.yml`: pinned images, only NPM publishes ports, healthchecks, `restart: unless-stopped`
- [ ] `.env` complete (§4.3), `chmod 600`, a copy of it stored safely off the server
- [ ] all images pull: `docker compose pull`
- [ ] `docker compose up -d`, all healthy

**Domain and HTTPS**

- [ ] DNS A records (or sslip.io hostname while waiting)
- [ ] NPM proxy host + Advanced routing, saved without SSL, `nginx -t` OK, `/api/health/` OK over HTTP
- [ ] certificate requested once DNS resolves, Force SSL on
- [ ] `COOKIE_INSECURE` removed

**Operations**

- [ ] `backup.sh` installed, first `run` OK, cron in place, restore tested
- [ ] first admin account created, login (incl. email code) tested end-to-end
- [ ] external uptime check on `/api/health/`
- [ ] every secret that was ever shared in chat/tickets rotated
