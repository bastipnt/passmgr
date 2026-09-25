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
pnpm format           # Format with Biome + sort imports/classNames (`format:check` for CI)
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

### Testing

Tests use **Vitest** (`pnpm --filter <name> test`, or `test:watch`). Configured in `server`, `web`, and packages `crypto`, `schema`, `db`, `store`. Test files live in `test/` dirs or alongside source as `*.test.ts`.

## Architecture

### Monorepo Structure

```
apps/
  web/       React 19 + Vite + Tailwind CSS v4, uses wouter for routing
  mobile/    React Native + Expo, styled with Uniwind (Tailwind v4 for RN)
  server/    Fastify 5 + tRPC backend, runs with Bun
packages/
  client/    Shared React hooks for auth (useLogin, useRegistration) + tRPC client setup
  crypto/    All cryptographic primitives (@noble/hashes, @noble/ciphers)
  db/        Drizzle ORM schema + migrations (PostgreSQL)
  schema/    Zod schemas shared between client and server
  ui/        Shared React web component library (shadcn-based), re-exports react-hook-form
  ui-native/ Shared React Native component library (Uniwind + cva + cn), re-exports react-hook-form
  ui-shared/ Design tokens (colors/spacing/radius) shared by web + native
  util/      Base64/string encoding utilities
  typescript-config/  Shared tsconfig base files
```

### Web app structure (`apps/web/src`)

```
app/         Composition root: App.tsx, routes.tsx (top Switch), route-paths.ts, ErrorFallback, NotFound
features/    auth/ · records/ (with records/login/, records/versions/) · password-generation/
components/  App-wide, feature-agnostic components only
hooks/ lib/ test/ types/
```

Rules:

- **Feature folders are flat.** Files sit directly in the feature. Nest only for a
  sub-domain (`records/login/` = the login record type, `records/versions/` = version
  history), **never** by file kind — no `components/`, `hooks/`, `pages/`, `forms/`,
  or `providers/` inside a feature.
- **Sub-domain vs. top-level feature: dependency direction decides, not file count.**
  A sub-domain stays *inside* its parent when it can't stand alone — no top-level route
  of its own, or it needs the parent's internals. Lifting it out would make the parent's
  `routes.tsx` import it while it imports back through the parent barrel: a cycle. It
  graduates to a top-level feature only once nothing in it imports the parent.
- **Sub-domain folders have no `index.ts`.** Import them by path (`./versions/VersionsSheet`).
  A barrel inside a feature hides the dependency graph and invites cycles.
- **Sub-domain files may climb exactly one level** (`../use-route-sheet`,
  `../login/LoginRecordFields`) to reach their parent feature; two or more is banned by
  `no-restricted-imports` — use `@/` for anything further.
- **Screens live in their feature** (`features/auth/LoginPage.tsx`). There is no
  top-level `pages/`. Only app-shell screens (`NotFound`, `ErrorFallback`) live in `app/`.
- **Every route string is in `app/route-paths.ts`** (`authPaths`, `recordPaths`).
  Never hardcode a path in a component.
- **Cross-feature imports go through the barrel**: `@/features/password-generation`,
  never `@/features/password-generation/PasswordField`. Enforced by
  `no-restricted-imports` in `apps/web/.oxlintrc.json`.
- **Inside a feature, use relative `./` imports.** Importing your own feature via `@/features/...`
  creates a cycle through the barrel.
- **One alias: `@/` → `src/`.** (`@pages`, `@components`, `@features`, `@utils` were removed.)
  Declared in three places that must stay in sync: `vite.config.ts`, `vitest.config.ts`,
  `tsconfig.app.json`.
- Web `features/records/` matches mobile's `features/records/` naming.

### Mobile styling (Uniwind)

`apps/mobile` + `packages/ui-native` style with **Uniwind** (Tailwind v4 for React
Native, `className` API) — the same mental model as web. No babel preset; classes
compile in the Metro transform via `withUniwindConfig` (`apps/mobile/metro.config.js`).

- Theme tokens live in `apps/mobile/src/global.css` as Uniwind `@variant light/dark`
  blocks, transcribed from `@repo/ui-shared` colors (web kebab-case names, e.g.
  `bg-primary`, `text-primary-foreground`). The spacing scale (`p-md`, `gap-lg`)
  maps to the values the old Tamagui config rendered.
- `@source "../../../packages/ui-native/src"` in `global.css` makes Tailwind scan the
  sibling package (v4 only auto-detects the app itself).
- Compose variants with `cva` + `cn()` from `@repo/ui-native/lib/utils`, mirroring
  `packages/ui`.
- Read tokens in JS via `useCSSVariable(name)` (in components) or
  `Uniwind.getCSSVariable(name)` (outside). Wrap non-core third-party components with
  `withUniwind` to give them `className`.
- The generated `apps/mobile/src/uniwind-types.d.ts` (dtsFile) is git-ignored;
  `className` prop augmentations come from `uniwind/types` (referenced in the
  `*-env.d.ts` files).

### Authentication Flow (OPAQUE protocol)

OPAQUE is `@cloudflare/opaque-ts` (P-256, scrypt KSF from `@repo/crypto/services/opaque-ksf`).

Registration:

1. Client: `OpaqueClient.registerInit` → sends `registrationRequest` to server
2. Server: `opaqueServer.registerInit` → returns `registrationResponse`
3. Client: `registerFinish` → generates `registrationRecord` + derives key hierarchy (Argon2id password KEK → vault key encrypted twice: once with password KEK, once with recovery KEK)
4. Server: stores `registrationRecord` + encrypted key material in DB

Login:

1. Client: normalizes the email (`normalizeEmail`, also enforced server-side by `emailSchema`), `OpaqueClient.authInit` → sends `startLoginRequest` (KE1)
2. Server: per-account throttle check (`loginlock:<emailHash>`; every start counts, reset on success), `opaqueServer.authInit` → returns `loginResponse` (KE2) + `attemptId`, stores the `expected` auth result in Redis under `login:<attemptId>` (5 min, single-use). Unknown emails get a KE2 from a deterministic fake record (`auth/fake-record.ts`) — no enumeration
3. Client: `authFinish` → derives `sessionKey`, sends KE3 + `attemptId` + a random `authSalt`
4. Server: `opaqueServer.authFinish` → verifies, derives `authKey`, creates session in Redis (24h sliding TTL, `authenticatedAt`), returns `sessionId` + encrypted vault key material
5. Client: `secretsStore.unlockSession()` derives `sessionSecret` and `authKey` from `sessionKey` via HKDF; `unlockVault()` then decrypts the vault key with the Argon2id password KEK (in a worker). Memory only on web; mobile persists the session bundle in Keychain/Keystore

### Request Authentication

Authenticated requests use HMAC-signed headers (no cookies):

- `x-session-id` — session identifier
- `x-timestamp` — Unix timestamp in ms (requests >5 min off are rejected)
- `x-nonce` — random UUID, claimed once in Redis (replay protection)
- `x-signature` — HMAC-SHA256 of `(type, path, timestamp, nonce, input)` using the `authKey`

The `protectedProcedure` middleware in `apps/server/src/auth/auth-middleware.ts` validates these headers on every protected tRPC call.
SSE subscriptions (no headers possible) send the same four values as tRPC `connectionParams`, signed over the fixed
path `SUBSCRIPTION_SIGNATURE_PATH` with empty input; they don't extend the session TTL. `freshAuthProcedure` additionally
requires an OPAQUE login ≤ 5 min ago (used for key changes). Key sets are versioned (`valid_from`/`valid_to`, one active
per user) — never `UPDATE` key material in place.

### Key Hierarchy

```
password ──Argon2id──► passwordKEK ──encrypt──► vaultKey
recoveryKey ──HKDF──► recoveryKEK ──encrypt──► vaultKey (backup)

sessionKey ──HKDF──► sessionSecret ──HKDF(+salt)──► authKey (HMAC signing)
```

Email is stored encrypted (XChaCha20-Poly1305) and hashed (HMAC-SHA256 keyed with server key) — never plaintext.

### tRPC Router Structure

`appRouter` (in `apps/server/src/router.ts`):

- `appConfig` → `appConfigRouter` (getConfig — public)
- `login` → `loginRouter` (startLogin, finishLogin, logout)
- `register` → `registrationRouter` (startRegistration, finishRegistration)
- `record` → `recordRouter` (sync, all, getById, history, create, update, delete, onRecordChange SSE) — uses `protectedProcedure`
- `user` → `userRouter` (heartbeat, rekeyPasswordKeys)

All procedures chain: `publicProcedure` → `loggedProcedure` → `protectedProcedure`

### Environment Variables

Server (`apps/server/.env`):

- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_HOST`, `REDIS_PORT`
- `OPAQUE_OPRF_SEED`, `OPAQUE_AKE_PRIVATE_KEY` — OPAQUE server secrets (generate with `bun apps/server/scripts/opaque-cf-bootstrap.ts`; must be stable)
- `OPAQUE_SERVER_IDENTITY` — defaults to `passmgr`; the client hardcodes the same value
- `OPAQUE_SERVER_SETUP` — key for email hashing / email-at-rest encryption (must be stable)
- `REGISTRATION_DISABLED` — `true` requires an invite (`apps/server/scripts/create-invite.ts`)
- `CORS_ORIGIN`, `TRUST_PROXY`, `RATE_LIMIT_DISABLED`, `PREFIX`, `LOG_LEVEL`

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
- `secretsStore` (singleton in `packages/store/src/secrets-store.ts`) holds all sensitive key material in memory. Call `wipe()` on key buffers when done.
- `OPAQUE_OPRF_SEED` / `OPAQUE_AKE_PRIVATE_KEY` are effectively the server's master keys — rotating them invalidates all user registrations. Rotating `OPAQUE_SERVER_SETUP` breaks email lookup (email hash).
