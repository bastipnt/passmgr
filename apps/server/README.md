# @repo/server

Backend for [passmgr](../../README.md). Fastify 5 + tRPC 11, runs on Bun.

## Stack

- **Fastify 5** HTTP server
- **tRPC 11** for the API
- **Bun** runtime (watch mode via `bun --watch`)
- **Drizzle ORM** (1.0 beta) against PostgreSQL 17
- **Redis 7** for session storage and OPAQUE login-state
- **OPAQUE** via `@cloudflare/opaque-ts`

## Routers

Defined in [`src/router.ts`](./src/router.ts):

| Router     | Purpose                                                     |
| ---------- | ----------------------------------------------------------- |
| `login`    | `startLogin`, `finishLogin` (OPAQUE protocol)               |
| `register` | `startRegistration`, `finishRegistration` (OPAQUE protocol) |
| `entry`    | `all`, `getById`, `update`, plus sync subscriptions         |
| `user`     | User-scoped operations                                      |

Procedure chain: `publicProcedure` → `loggedProcedure` → `protectedProcedure`.

`protectedProcedure` (see [`src/auth/authMiddleware.ts`](./src/auth/authMiddleware.ts)) validates per-request HMAC headers:

- `x-session-id` — session identifier
- `x-timestamp` — Unix timestamp; requests older than 5 min are rejected (replay window)
- `x-signature` — HMAC-SHA256 of `(type, path, timestamp, input)` keyed with the session's `authKey`

No cookies. The client signs every request from material derived during login.

## Env vars

Create `.env` in this directory:

| Var                   | Purpose                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string                                                                                                |
| `REDIS_HOST`          | Redis hostname                                                                                                              |
| `REDIS_PORT`          | Redis port                                                                                                                  |
| `OPAQUE_SERVER_SETUP` | base64 OPAQUE server setup. **Effectively the master key — rotating breaks all registrations.** Generate once, keep stable. |

## Dev

```bash
pnpm --filter server dev
```

Make sure Postgres + Redis are up (`pnpm db:up` from repo root) and migrations have run (`pnpm db:migrate`).

## Tests

```bash
pnpm --filter server test               # unit
pnpm --filter server test:integration   # integration (hits real Postgres + Redis)
```

Integration tests cover the full OPAQUE flow, session lifecycle, replay protection, record sync, and email encryption invariants.

## Encrypted-at-rest fields

- **Email**: stored as XChaCha20-Poly1305 ciphertext + HMAC-SHA256 lookup hash (server-key derived). Never as plaintext.
- **Vault key**: stored wrapped twice — once by `passwordKEK` (derived from the user's password via Argon2id), once by `recoveryKEK` (derived from the recovery key the client generated). Server cannot unwrap either.
