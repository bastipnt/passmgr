# Deployment Guide

## Docker Compose (Production)

Stack (`docker-compose.prod.yml`): Caddy (web) + Fastify/Bun (server) + PostgreSQL + Redis, behind a host
reverse proxy that terminates TLS. Optional: a bundled Stalwart mail server (`docs/ops/email.md`).

### Prerequisites

- Docker + Docker Compose
- Access to the `ghcr.io` images (or build them locally)
- A host Caddy running [caddy-docker-proxy](https://github.com/lucaslorentz/caddy-docker-proxy): the `web` service
  publishes no port and is routed by its `caddy` labels. Another proxy works too, but then you route to `web:8080`
  on `caddy_network` yourself.
- The external networks the stack joins:

  ```bash
  docker network create caddy_network            # host proxy -> web
  docker network create mail_network             # server -> SMTP relay
  docker network create passmgr_metrics_network  # monitoring -> server :3001 (docs/ops/monitoring.md)
  ```

### Steps

**1. Copy the example env file**

```bash
cp .env.production.example .env.production
```

**2. Generate the secrets** (once; back them up offline, see [Backups](#backups))

```bash
bun apps/server/scripts/opaque-cf-bootstrap.ts   # OPAQUE_OPRF_SEED, OPAQUE_AKE_PRIVATE_KEY
openssl rand -base64 32                          # OPAQUE_SERVER_SETUP
openssl rand -hex 32                             # POSTGRES_PASSWORD, POSTGRES_APP_PASSWORD, REDIS_PASSWORD (one each)
```

**Never rotate the `OPAQUE_*` values**: losing or changing any of them invalidates every account. Never reuse the
dev values from `apps/server/.env`.

**3. Fill in `.env.production`**

See [Environment Variables](#environment-variables) below.

**4. Deploy**

Migrations run as their own step, as the database owner, before the server starts
(this is what `infra/deploy/remote-deploy.sh` does on every release):

```bash
compose() { docker compose -f docker-compose.prod.yml --env-file .env.production "$@"; }
compose pull
compose up -d --wait postgres
compose run --rm migrate        # schema as `passmgr`, (re)grants `passmgr_app`
compose up -d --remove-orphans --wait
```

The server itself connects as `passmgr_app` (data access only) and never migrates.

### Releases and rollback

CI (`.github/workflows/release.yml`) pipes `infra/deploy/remote-deploy.sh` over SSH to the deploy host. It needs
`DEPLOY_PATH` and `IMAGE_TAG`; CI also sets `WEB_DIGEST` and `SERVER_DIGEST` (without them the tag is pulled as is).
In order:

1. Pulls the images, then takes a `pg_dump` of the running database (see [Backups](#backups)).
2. Runs the migrations (`migrate` service). A failure here stops the deploy and leaves the old release running untouched.
3. Rolls out the new images and waits for the stack to become healthy. On success it records the release in
   `.deployed-tag` and `.deployed-digests`.
4. If the stack doesn't become healthy, it prints the server's last log lines and rolls back to the previously
   deployed images (by digest, or by tag for a release deployed before digests were recorded). The deploy still fails.

The rollback restores the old images only, not the database. If the failed release applied a migration the old server
can't handle, restore the pre-deploy backup.

### Backups

`infra/deploy/remote-deploy.sh` takes a `pg_dump` before each migrate step (kept on the host, last 10). That is not an
off-site backup. Back up `.env.production` separately: a database without its `OPAQUE_*` secrets is useless.

---

## Environment Variables

All variables go in `.env.production` (root of the repo). `.env.production.example` lists them with comments.

### Required

| Variable | Description |
|---|---|
| `GHCR_OWNER` | GitHub user or org (lowercase) that owns the `passmgr-web` / `passmgr-server` images on GHCR. |
| `PUBLIC_HOSTNAME` | Public hostname, e.g. `pass.example.com`. The host Caddy routes it to the web container. |
| `POSTGRES_PASSWORD` | Password of the owner role `passmgr` (migrations). |
| `POSTGRES_APP_PASSWORD` | Password of `passmgr_app`, the server's data-only role (created by the migrate step). |
| `REDIS_PASSWORD` | Redis `requirepass`. Redis holds live session keys. No quotes or backslashes. |
| `OPAQUE_OPRF_SEED`, `OPAQUE_AKE_PRIVATE_KEY` | OPAQUE server secrets (`opaque-cf-bootstrap.ts`). Must stay stable. |
| `OPAQUE_SERVER_SETUP` | Key for email hashing, email at rest, TOTP secrets and backup codes. Must stay stable. |

### Optional

| Variable | Default | Description |
|---|---|---|
| `IMAGE_TAG` | `latest` | Image tag to pull. CI sets it per release. |
| `WEB_DIGEST`, `SERVER_DIGEST` | — | Pin the images by `sha256:…` digest (CI does). |
| `POSTGRES_DB` | `passmgr` | Database name. |
| `CORS_ORIGIN` | `https://$PUBLIC_HOSTNAME` | Exact web origin(s), comma-separated (CORS + WebAuthn origin check). |
| `REGISTRATION_DISABLED` | `true` | `true` requires an invite (`apps/server/scripts/create-invite.ts`). |
| `TRUST_PROXY` | `loopback,uniquelocal` | IPs/CIDRs or proxy-addr names of the proxies in front of the server. Never a hop count. |
| `SMTP_URL`, `MAIL_FROM` | — | SMTP for email verification codes. Unset = no verification. See `docs/ops/email.md`. |
| `LOG_LEVEL` | `info` | pino log level. |
| `CLIENT_VERSIONS` | — | Mobile releases still in use, comma-separated; crash reports from other versions count as `other`. |
| `COMPOSE_PROFILES`, `MAIL_HOSTNAME`, `STALWART_TAG` | — | Bundled Stalwart (profile `mail`), see `docs/ops/email.md`. |

### Set by the compose file

Don't put these in `.env.production`: `DATABASE_URL` (built from the passwords above), `REDIS_HOST`, `REDIS_PORT`,
`PREFIX=/trpc` (the web Caddy forwards only `/trpc/*`). All server variables: `apps/server/CLAUDE.md`.

---

## Architecture

```
Internet
   │
   ▼
[host Caddy / TLS]  ── caddy_network ──►  [web: Caddy :8080]
                                             ├── /trpc/*  ──► [server :3000] ◄──► [postgres] + [redis]
                                             └── /*       ──► static web files (SPA)
[monitoring] ── passmgr_metrics_network ──►  [server :3001]  /health, /metrics
```

- **web** (Caddy) serves the pre-built React app and proxies `/trpc/*` to the server.
- **server** (Bun + Fastify + tRPC) handles the API on `:3000`; `/health` and `/metrics` are on `:3001` only.
- **migrate** is a one-shot run of the server image (`profiles: [migrate]`).
- **postgres** stores accounts, key sets, vaults and every record version (`postgres_data` volume).
- **redis** stores login state and sessions (`redis_data` volume).
- Every container runs read-only, with `no-new-privileges` and all capabilities dropped except what the databases need.
