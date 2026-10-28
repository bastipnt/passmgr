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

### Testing

Tests use **Vitest** (`pnpm --filter <name> test`, or `test:watch`). Configured in `server`, `web`, and packages `crypto`, `schema`, `db`, `store`, `ui-shared`. Test files live in `test/` dirs or alongside source as `*.test.ts`.
Web E2E (Playwright): `pnpm --filter web e2e`, see `apps/web/CLAUDE.md`.

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
  store/     On-device SQLite (one DB per profile) + secretsStore
  ui/        Shared React web component library (shadcn-based), re-exports react-hook-form
  ui-native/ Shared React Native component library (Uniwind + cva + cn), re-exports react-hook-form
  ui-shared/ Design tokens (colors/spacing/radius) shared by web + native
  util/      Base64/string encoding utilities
  typescript-config/  Shared tsconfig base files
```

### Where the details live

Nested `CLAUDE.md` files load when you work in their directory:

- `apps/web/CLAUDE.md` — folder / import rules, record list + form layout, theme presets, phone pages, E2E, served-code trust
- `apps/mobile/CLAUDE.md` — Uniwind styling, fonts, autofill, share extension
- `apps/server/CLAUDE.md` — request signing, tRPC routers, ops routes, env vars
- `packages/store/CLAUDE.md` — on-device SQLite, migrations, transactions
- `packages/db/CLAUDE.md` — Postgres dev reset, Drizzle beta
- `packages/crypto/CLAUDE.md` — password KEK params, Argon2, wrap AADs

Cross-cutting flows (client + store + server + UI) are in `docs/architecture/`. **Read the matching file before
changing one of these flows:**

- `auth.md` — OPAQUE, registration, login + second factor, web biometric / device login, session modes
  (`local` / `online` / `offline`, `networkOffline`), recovery (server, local, linked), password change, two-factor
  enrollment, account deletion, emergency kit
- `local-vaults.md` — local vaults, durability, export / import, import from other managers (CSV, Bitwarden, 1PUX,
  KeePass), linking a local vault to an account
- `vaults-and-sync.md` — vault model, membership access, `record.sync` / `record.push`, limits and storage quota, conflict
  merge, trash / purge, key rotation, sharing, vault UI
- `records.md` — Pass Monitor, security score, breach check, login email, favorites, duplicate, tags and search

Design decisions ("ADR 0001 Dn"): `docs/adr/0001-offline-first-local-vaults.md`. Sync cursor: `docs/sync-cursor.md`.

### Key Hierarchy

```
password ──Argon2id──► passwordKEK ──wrap──► accountKey
recoveryKey ──HKDF──► recoveryKEK ──wrap──► accountKey (backup)
recoveryKey ──HKDF──► recoveryAuthKey ──SHA-256──► recoveryVerifier (server, recovery proof)
accountKey ──wrap──► vaultKey[vaultId] ──encrypt──► records
vaultKey[v] ──wrap──► vaultKey[v-1]     (rotation chain, `previousKeys`; opens the history)
accountKey ──wrap──► x25519PrivateKey   (sharing; public key published, `user.publicKey`)
senderPrivKey + memberPublicKey ──seal──► vaultKey   (invites, rotated keys: `sealVaultKey`, authenticated
                                                    by the sender; the member rewraps it, `vault.acceptKey`)
(biometric KEK / mobile login bundle also hold the accountKey, never a vault key;
 mobile autofill entries hold decrypted login passwords, under a biometric-gated device key)

sessionKey ──HKDF──► sessionSecret ──HKDF(+salt)──► authKey (HMAC signing)
X25519(device login ephemerals) ──HKDF(challenge)──► sessionKey   (web biometric device login)
```

Every record lives in one vault and is encrypted with that vault's key. Email is stored encrypted
(XChaCha20-Poly1305) and hashed (HMAC-SHA256 keyed with server key) — never plaintext.

## Code Conventions

- **Linting**: OXLint (`--type-aware`) is primary; ESLint for specific rules. Runs on pre-push via Lefthook.
- **Commits**: Conventional Commits enforced via commitlint (`feat`, `fix`, `refactor`, `chore`, etc.)
- **CSS modules**: Web app uses `typed-css-modules` (`tcm`). Run `pnpm typegen:css` to regenerate `.d.ts` files after CSS changes.
- **Styling**: Tailwind CSS v4. Use `cn()` from `@repo/ui/theme` for conditional classes. Design tokens: `primary-500`, `surface-3`, `text-primary`.
- **Imports**: Workspace packages use `@repo/` prefix. Use barrel `index.ts` exports.
- **Vite**: Overridden globally to `rolldown-vite` via pnpm overrides.
- **Drizzle**: Using a beta version (`1.0.0-beta.15-*`) with `defineRelationsPart` API — this differs from stable Drizzle docs.
- **Docs**: when you change a flow, update its `docs/architecture/` file or nested `CLAUDE.md`, not this file.

## Security Invariants

- The `recoveryKey` is generated client-side and must **never** be sent to the server (see comment in `packages/client/src/register.ts`).
- `secretsStore` (singleton in `packages/store/src/secrets-store.ts`) holds all sensitive key material in memory. Call `wipe()` on key buffers when done.
- Key sets are versioned (`valid_from`/`valid_to`, one active per user) — never `UPDATE` key material in place.
- `OPAQUE_OPRF_SEED` / `OPAQUE_AKE_PRIVATE_KEY` are effectively the server's master keys — rotating them invalidates all user registrations. Rotating `OPAQUE_SERVER_SETUP` breaks email lookup (email hash).
- What a device copy exposes (local-only vaults, device loss, backups, exports): `docs/security/threat-model-inputs.md`. Keep it current when on-device storage or key caching changes.
