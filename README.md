# passmgr

A full-stack, cross-platform password manager built on **OPAQUE** zero-knowledge authentication. TypeScript monorepo, pnpm + Turborepo.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)

> ⚠️ **Early prototype — not production-ready.**
>
> The cryptographic stack has not been audited. The architecture, API, and storage format change frequently. **Do not store real passwords with this yet.** Treat this as a research / learning project that happens to compile.

## What it is

A password manager that uses [OPAQUE](https://datatracker.ietf.org/doc/draft-irtf-cfrg-opaque/) (an asymmetric PAKE) so the server never sees your plaintext password — not at registration, not at login, not even in transit. The vault key is wrapped client-side and stored encrypted on the server.

### Key hierarchy

```
password ──Argon2id──► passwordKEK ──encrypt──► vaultKey
recoveryKey ──HKDF──► recoveryKEK ──encrypt──► vaultKey  (backup wrap)

sessionKey ──HKDF──► sessionSecret ──HKDF(+salt)──► authKey  (HMAC request signing)
```

Email is stored encrypted (XChaCha20-Poly1305) and indexed via a server-keyed HMAC — never as plaintext.

## What works today

- **Web client**: registration, login, vault list / view / add / edit / delete, real-time record sync.
- **Server**: OPAQUE flow end to end, HMAC-signed request auth, session storage in Redis, replay protection (5 min timestamp window).
- **Tests**: Vitest unit + integration suites, Playwright E2E for register/login, Stryker mutation testing on crypto / store / server-auth / client packages.

## What's missing

- **Web**: no idle lock, no password recovery UI, no auto-relock on tab close.
- **Mobile**: auth flow only. No vault, no records, no biometric unlock yet.
- **Server**: no rate limiting, some signature-validation edge cases still TODO.

See [roadmap.md](./roadmap.md) for the full plan.

## Stack

| Layer   | Tech                                                                  |
| ------- | --------------------------------------------------------------------- |
| Web     | React 19, Vite (rolldown-vite), Tailwind v4, wouter, tRPC client      |
| Mobile  | React Native 0.83, Expo 55, Tamagui, NativeWind                       |
| Server  | Fastify 5, tRPC 11, Bun runtime, Drizzle ORM (1.0 beta)               |
| Data    | PostgreSQL 17, Redis 7                                                |
| Crypto  | `@cloudflare/opaque-ts`, `@noble/hashes`, `@noble/ciphers`            |
| Tooling | pnpm 10 workspaces, Turborepo, OXLint, Prettier, Lefthook, commitlint |

## Repo layout

```
apps/
  web/       React 19 + Vite web client
  mobile/    React Native + Expo client (auth-only for now)
  server/    Fastify + tRPC backend, runs on Bun
packages/
  client/             Shared React hooks (useLogin, useRegistration) + tRPC client + secrets store
  crypto/             All cryptographic primitives
  db/                 Drizzle schema + migrations (PostgreSQL)
  schema/             Zod schemas shared between client and server
  store/              Frontend data store + sync logic
  tokens/             Design tokens (colors, spacing)
  types/              Shared TypeScript types
  typescript-config/  Shared tsconfig base files
  ui/                 Shared web component library (shadcn-based)
  ui-native/          Mobile component library (Tamagui-based)
  util/               Base64 / string encoding helpers
```

## Quick start

You need: Node 18+, pnpm 10, Docker (for Postgres + Redis), and optionally Bun (server runtime).

```bash
pnpm install

# Start Postgres + Redis
pnpm db:up

# Run migrations
pnpm db:migrate

# Start everything in watch mode
pnpm dev
```

### Required env vars

Server (`apps/server/.env`):

| Var                   | Notes                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string                                                       |
| `REDIS_HOST`          | e.g. `localhost`                                                                   |
| `REDIS_PORT`          | e.g. `6379`                                                                        |
| `OPAQUE_SERVER_SETUP` | base64 OPAQUE server setup. **Must stay stable** — rotating invalidates all users. |

DB package (`packages/db/.env`):

| Var            | Notes                          |
| -------------- | ------------------------------ |
| `DATABASE_URL` | Same as above, used by Drizzle |

### Common scripts

```bash
pnpm dev              # all apps in watch mode
pnpm build            # build everything via turbo
pnpm lint             # OXLint, type-aware
pnpm typecheck        # tsc across the monorepo
pnpm test             # Vitest unit tests
pnpm test:integration # integration suites
pnpm e2e              # Playwright
pnpm format           # Prettier
pnpm db:generate      # Drizzle migration generation
pnpm db:migrate       # Drizzle migration apply
```

Per-app:

```bash
pnpm --filter web dev
pnpm --filter server dev
pnpm --filter mobile start
```

## Per-app docs

- [apps/web/README.md](./apps/web/README.md)
- [apps/mobile/README.md](./apps/mobile/README.md)
- [apps/server/README.md](./apps/server/README.md)

## Contributing

PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Open an issue before tackling anything large; the architecture is still in motion.

## Security

**Do not file public issues for security problems.** See [SECURITY.md](./SECURITY.md) for the private disclosure path.

The crypto stack is **unaudited**.

## License

[AGPL-3.0-only](./LICENSE). You can self-host and modify freely; if you run a modified version as a network service, you must publish your source under the same license.
