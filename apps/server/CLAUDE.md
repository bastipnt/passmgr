# apps/server

Server-specific guidance. Cross-cutting rules are in the root `CLAUDE.md`; the login, recovery, sync and sharing
flows (client + server) are in `docs/architecture/`.

## Request Authentication

Authenticated requests use HMAC-signed headers (no cookies):

- `x-session-id` — session identifier
- `x-timestamp` — Unix timestamp in ms (requests >5 min off are rejected)
- `x-nonce` — random UUID, claimed once in Redis (replay protection)
- `x-signature` — HMAC-SHA256 of `(type, path, timestamp, nonce, input)` using the `authKey`

The `protectedProcedure` middleware in `apps/server/src/auth/auth-middleware.ts` validates these headers on every protected tRPC call.
SSE subscriptions (no headers possible) send the same four values as tRPC `connectionParams`, signed over the fixed
path `SUBSCRIPTION_SIGNATURE_PATH` with empty input; they don't extend the session TTL. `freshAuthProcedure` additionally
requires an OPAQUE login ≤ 5 min ago (used for key changes; a device login never counts). Key sets are versioned (`valid_from`/`valid_to`, one active
per user) — never `UPDATE` key material in place.

## tRPC Router Structure

`appRouter` (in `apps/server/src/router.ts`):

- `appConfig` → `appConfigRouter` (getConfig — public)
- `clientError` → `clientErrorRouter` (report — public; a crash counter, input is strict enums, see `docs/ops/monitoring.md`)
- `login` → `loginRouter` (startLogin, finishLogin, startDeviceLogin, finishDeviceLogin, verifySecondFactor, logout)
- `register` → `registrationRouter` (startRegistration, finishRegistration)
- `recovery` → `recoveryRouter` (startRecovery, finishRecovery — public)
- `record` → `recordRouter` (sync, history, push, onRecordChange SSE) — `verifiedProcedure`, the SSE `verifiedSubscriptionProcedure`
- `vault` → `vaultRouter` (list, create, updateMeta, rotateKey, delete — owner only, never the personal vault; sharing:
  invite, invitations, acceptKey, declineInvite, members, setMemberRole, removeMember, leave, transferOwnership) — `verifiedProcedure`
- `session` → `sessionRouter` (list, revoke, revokeOthers — the signed-in devices; listed by a hash of the session id, never the id;
  a revoked device locks: `signedout:<sessionId>` marker, see Session modes in `docs/architecture/auth.md`) — `protectedProcedure`. UI: `useSessions`, web Settings → Account & sync (`SessionsSettings`),
  mobile Settings (`SessionsSection`)
- `activity` → `activityRouter` (list — the account's security log, `account_events`, see Account activity in
  `docs/architecture/auth.md`) — `protectedProcedure`. Record a new event type with `recordAccountEvent` / `recordAction`
- `user` → `userRouter` (heartbeat, emailVerificationStatus, sendVerificationCode, verifyEmail, rekeyPasswordKeys, startPasswordChange, finishPasswordChange, deleteAccount, publicKey — another user's public key by email;
  registerDeviceCredential, linkDeviceCredential, removeDeviceCredential (web biometric device login);
  two-factor: twoFactorStatus, startTotpEnrollment, confirmTotp, disableTotp, regenerateBackupCodes)

tRPC batching is off (`allowBatching: false`, `src/trpc-options.ts`): the per-IP rate limit counts HTTP requests, and a
batch would run many calls in one. Clients use `httpLink`, never `httpBatchLink`.

All procedures chain: `publicProcedure` → `loggedProcedure` → `protectedProcedure` (→ `freshAuthProcedure` for key changes,
→ `verifiedProcedure` for sync and sharing: FORBIDDEN `email_unverified` until the email is verified, see Email verification
in `docs/architecture/auth.md`)

Ops routes (`apps/server/src/health.ts`, plain Fastify, outside `PREFIX` so the public proxy never forwards them):
`GET /health` (Postgres `select 1` + Redis `PING`, 200 / 503; the compose healthchecks) and `GET /metrics`
(Prometheus, `@prometheus-io/client` registry in `src/metrics.ts`; `loggedProcedure`, which every procedure builds on, records each call;
domain counters for logins, auth failures, recovery, rate limits and email verification, plus the `passmgr_active_users`
gauge from per-day Redis HyperLogLogs (`src/active-users.ts`); labels never a user / vault / email / IP).
In prod the host's monitoring stack scrapes them over the external `passmgr_metrics_network` (alias `passmgr-server`); dashboards
and alerts live in that stack's repo, see `docs/ops/monitoring.md`.

Logging: pino options in `src/log-options.ts` (redact paths, request serializer without query string, client IP cut to
/24 or /48); `log-options.test.ts` checks the redaction. A new secret field in a logged object goes into `SECRET_KEYS`.
An `INTERNAL_SERVER_ERROR` reaches the client as a constant message (`errorFormatter`, `src/trpc.ts`). Every logged `err`
goes through `loggableError` (`src/util/loggable-error.ts`: type, code, message, stack frames along the cause chain, no
other fields), which drops every message once a database error is in the chain: a failed query's holds the SQL and its
params. Zod integers stored in an int4 column are `z.int32()`, so an out-of-range value is a 400, not a failed query.

## Environment Variables

Server (`apps/server/.env`, committed): dev config, with the `OPAQUE_*` secrets encrypted by
[dotenvx](https://dotenvx.com). `dev` / `invite` run under `dotenvx run`, which decrypts them with
`apps/server/.env.keys` (gitignored; get it from a teammate, or regenerate: delete `.env.keys`, put fresh values from
`scripts/opaque-cf-bootstrap.ts` in `.env`, `pnpm exec dotenvx encrypt -k "OPAQUE_*"`, then `pnpm db:reset:hard`, since
new OPAQUE keys invalidate every registration). Instead of the file, `DOTENV_PRIVATE_KEY` in the env works too. Change a secret with
`pnpm exec dotenvx set KEY value`; add a plain value by editing `.env`. Tests don't need the key (`global-setup.ts`
sets the secrets). Production uses `.env.production` on the deploy host, not this file:
never reuse the dev `OPAQUE_*` values (or `.env.keys`) there, since anyone who has had the dev key can decrypt them;
generate fresh ones.

Startup fails on a bad config: `src/env.ts` (`serverEnv`, one Zod schema, imported first by `server.ts` / `opaque.ts`)
validates the OPAQUE secrets, `PREFIX`, `TRUST_PROXY`, `CORS_ORIGIN` (parsed by `util/allowed-origins.ts`) and
`STORAGE_QUOTA_MB` / `KEY_SET_RETENTION_DAYS`; `@repo/db` throws without `DATABASE_URL`. Read a new server env var through `serverEnv`.

- `DATABASE_URL` — PostgreSQL connection string (required; `@repo/db` reads `apps/server/.env` only outside production)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (`requirepass`; required by `docker-compose.prod.yml`, empty = no auth)
- `OPAQUE_OPRF_SEED`, `OPAQUE_AKE_PRIVATE_KEY` — OPAQUE server secrets, base64 of 32 bytes each (generate with `bun apps/server/scripts/opaque-cf-bootstrap.ts`; must be stable)
- `OPAQUE_SERVER_SETUP` — key for email hashing, email-at-rest, TOTP secret and backup-code keys (must be stable;
  ≥ 32 bytes, `openssl rand -base64 32`; the key is the string's UTF-8 bytes as given, never trimmed or decoded)
- `REGISTRATION_DISABLED` — `true` requires an invite (`apps/server/scripts/create-invite.ts`)
- `SMTP_URL` (e.g. `smtps://user:pass@smtp.example.com`), `MAIL_FROM` — mail for email verification codes; unset = no
  verification (every account counts as verified). Dev: Mailpit from `pnpm db:up`, `SMTP_URL=smtp://localhost:1025`
  (UI on :8025); prod: Stalwart or any SMTP relay, see `docs/ops/email.md`
- `STORAGE_QUOTA_MB` — storage per vault owner (default 100), see `docs/architecture/vaults-and-sync.md`
- `KEY_SET_RETENTION_DAYS` — days a closed key set is kept before the hourly purge deletes it (default 14, `0` = next run), see Password change in `docs/architecture/auth.md`
- `CORS_ORIGIN` — exact web origins, comma-separated (`util/allowed-origins.ts`: CORS + the WebAuthn origin check); required in production, unset in dev = localhost 5173 / 4173 / 8080
- `PREFIX` — tRPC mount path (e.g. `/trpc`); required in production, so tRPC never sits next to `/health` / `/metrics`
- `TRUST_PROXY` — proxy IPs/CIDRs or proxy-addr names, never a hop count; unset in production logs
  `config.trust_proxy_unset` (behind a proxy every client would share one rate-limit bucket)
- `RATE_LIMIT_DISABLED`, `LOG_LEVEL`

CORS sends no `Access-Control-Allow-Credentials`: there are no cookies, and the client fetches without credentials.
