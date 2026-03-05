# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack, cross-platform password manager built as a TypeScript monorepo using pnpm workspaces and Turborepo. It uses **OPAQUE** (an asymmetric password-authenticated key exchange protocol) for zero-knowledge authentication — the server never sees the user's plaintext password.

## Commands

### Root (from project root)

```bash
pnpm dev              # Start all apps in development mode
pnpm build            # Build all packages and apps
pnpm lint             # Lint all packages (OXLint)
pnpm typecheck        # Type check all packages
pnpm format           # Format with Prettier
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run migrations
pnpm db:up            # Start Postgres via Docker Compose
```

### Per-app (use `--filter <name>`)

```bash
pnpm --filter web dev          # Vite dev server
pnpm --filter server dev       # Bun watch server
pnpm --filter mobile start     # Expo dev server
```

### DB package (run from `packages/db/`)

```bash
bun ./devResetDB.ts   # Reset dev database
```

No test framework is currently configured.

## Architecture

### Monorepo Structure

```
apps/
  web/       React 19 + Vite + Tailwind CSS v4, uses wouter for routing
  mobile/    React Native + Expo
  server/    Fastify 5 + tRPC backend, runs with Bun
packages/
  client/    Shared React hooks for auth (useLogin, useRegistration) + tRPC client setup
  crypto/    All cryptographic primitives (@noble/hashes, @noble/ciphers)
  db/        Drizzle ORM schema + migrations (PostgreSQL)
  schema/    Zod schemas shared between client and server
  ui/        Shared React component library (shadcn-based), re-exports react-hook-form
  util/      Base64/string encoding utilities
  typescript-config/  Shared tsconfig base files
```

### Authentication Flow (OPAQUE protocol)

Registration:
1. Client: `opaque.client.startRegistration` → sends `registrationRequest` to server
2. Server: `opaque.server.createRegistrationResponse` → returns `registrationResponse`
3. Client: `opaque.client.finishRegistration` → generates `registrationRecord` + derives key hierarchy (Argon2id password KEK → vault key encrypted twice: once with password KEK, once with recovery KEK)
4. Server: stores `registrationRecord` + encrypted key material in DB

Login:
1. Client: `opaque.client.startLogin` → sends `startLoginRequest`
2. Server: `opaque.server.startLogin` → returns `loginResponse`, stores `serverLoginState` in Redis
3. Client: `opaque.client.finishLogin` → derives `sessionKey`
4. Server: `opaque.server.finishLogin` → verifies, creates session in Redis, returns `sessionId` + encrypted vault key material
5. Client: `secretsStore.unlock()` — derives `sessionSecret` and `authKey` from `sessionKey` via HKDF; stores in memory only

### Request Authentication

Authenticated requests use HMAC-signed headers (no cookies):
- `x-session-id` — session identifier
- `x-timestamp` — Unix timestamp (requests >5 min old are rejected as replay protection)
- `x-signature` — HMAC-SHA256 of `(type, path, timestamp, input)` using the `authKey`

The `protectedProcedure` middleware in `apps/server/src/auth/authMiddleware.ts` validates these headers on every protected tRPC call.

### Key Hierarchy

```
password ──Argon2id──► passwordKEK ──encrypt──► vaultKey
recoveryKey ──HKDF──► recoveryKEK ──encrypt──► vaultKey (backup)

sessionKey ──HKDF──► sessionSecret ──HKDF(+salt)──► authKey (HMAC signing)
```

Email is stored encrypted (XChaCha20-Poly1305) and hashed (HMAC-SHA256 keyed with server key) — never plaintext.

### tRPC Router Structure

`appRouter` (in `apps/server/src/router.ts`):
- `login` → `loginRouter` (startLogin, finishLogin)
- `register` → `registrationRouter` (startRegistration, finishRegistration)
- `entry` → `entryRouter` (all, getById, update) — uses `protectedProcedure`
- `user` → `userRouter`

All procedures chain: `publicProcedure` → `loggedProcedure` → `protectedProcedure`

### Environment Variables

Server (`apps/server/.env`):
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_HOST`, `REDIS_PORT`
- `OPAQUE_SERVER_SETUP` — base64-encoded OPAQUE server setup secret (must be stable across restarts)

DB package (`packages/db/.env`):
- `DATABASE_URL`

## Code Conventions

- **Linting**: OXLint (`--type-aware`) is primary; ESLint for specific rules. Runs on pre-push via Lefthook.
- **Commits**: Conventional Commits enforced via commitlint (`feat`, `fix`, `refactor`, `chore`, etc.)
- **CSS modules**: Web app uses `typed-css-modules` (`tcm`). Run `pnpm typegen:css` to regenerate `.d.ts` files after CSS changes.
- **Styling**: Tailwind CSS v4. Use `cn()` from `@repo/ui/theme` for conditional classes. Design tokens: `primary-500`, `surface-3`, `text-primary`.
- **Imports**: Workspace packages use `@repo/` prefix. Use barrel `index.ts` exports.
- **Vite**: Overridden globally to `rolldown-vite` via pnpm overrides.
- **Drizzle**: Using a beta version (`1.0.0-beta.15-*`) with `defineRelationsPart` API — this differs from stable Drizzle docs.

## Security Invariants

- The `recoveryKey` is generated client-side and must **never** be sent to the server (see comment in `packages/client/src/register.ts`).
- `secretsStore` (singleton in `packages/client/src/secrets-store.ts`) holds all sensitive key material in memory. Call `wipe()` on key buffers when done.
- The `OPAQUE_SERVER_SETUP` env var is effectively the server's master key — rotating it invalidates all user registrations.
