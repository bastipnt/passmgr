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
- `login` → `loginRouter` (startLogin, finishLogin, startDeviceLogin, finishDeviceLogin, verifySecondFactor, logout)
- `register` → `registrationRouter` (startRegistration, finishRegistration)
- `recovery` → `recoveryRouter` (startRecovery, finishRecovery — public)
- `record` → `recordRouter` (sync, history, push, onRecordChange SSE) — `protectedProcedure`, the SSE `protectedSubscriptionProcedure`
- `vault` → `vaultRouter` (list, create, updateMeta, rotateKey, delete — owner only, never the personal vault; sharing:
  invite, invitations, acceptKey, declineInvite, members, setMemberRole, removeMember, leave, transferOwnership) — `protectedProcedure`
- `session` → `sessionRouter` (list, revoke, revokeOthers — the signed-in devices; listed by a hash of the session id, never the id;
  a revoked device locks: `signedout:<sessionId>` marker, see Session modes in `docs/architecture/auth.md`) — `protectedProcedure`. UI: `useSessions`, web Settings → Account & sync (`SessionsSettings`),
  mobile Settings (`SessionsSection`)
- `user` → `userRouter` (heartbeat, rekeyPasswordKeys, startPasswordChange, finishPasswordChange, deleteAccount, publicKey — another user's public key by email;
  registerDeviceCredential, linkDeviceCredential, removeDeviceCredential (web biometric device login);
  two-factor: twoFactorStatus, startTotpEnrollment, confirmTotp, disableTotp, regenerateBackupCodes)

All procedures chain: `publicProcedure` → `loggedProcedure` → `protectedProcedure` (→ `freshAuthProcedure` for key changes)

Ops routes (`apps/server/src/health.ts`, plain Fastify, outside `PREFIX` so the public proxy never forwards them):
`GET /health` (Postgres `select 1` + Redis `PING`, 200 / 503; the compose healthchecks) and `GET /metrics`
(Prometheus, `@prometheus-io/client` registry in `src/metrics.ts`; `loggedProcedure`, which every procedure builds on, records each call).

## Environment Variables

Server (`apps/server/.env`):

- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (`requirepass`; required by `docker-compose.prod.yml`, empty = no auth)
- `OPAQUE_OPRF_SEED`, `OPAQUE_AKE_PRIVATE_KEY` — OPAQUE server secrets (generate with `bun apps/server/scripts/opaque-cf-bootstrap.ts`; must be stable)
- `OPAQUE_SERVER_SETUP` — key for email hashing / email-at-rest encryption (must be stable)
- `REGISTRATION_DISABLED` — `true` requires an invite (`apps/server/scripts/create-invite.ts`)
- `STORAGE_QUOTA_MB` — storage per vault owner (default 100), see `docs/architecture/vaults-and-sync.md`
- `CORS_ORIGIN` — exact web origins, comma-separated (`util/allowed-origins.ts`: CORS + the WebAuthn origin check); required in production, unset in dev = localhost 5173 / 4173 / 8080
- `TRUST_PROXY`, `RATE_LIMIT_DISABLED`, `PREFIX`, `LOG_LEVEL`
