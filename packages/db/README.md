# @repo/db

Drizzle ORM schema + migrations for [passmgr](../../README.md). PostgreSQL 17.

## Consumers

- `apps/server`

## What's in here

- Drizzle schema definitions (`src/schema/*`)
- Relations declared with the new `defineRelationsPart` API (this repo runs **Drizzle 1.0 beta**, which differs from current stable docs — see [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) beta notes)
- Generated migration SQL in `drizzle/`
- `devResetDB.ts` — wipes + re-applies the dev database

## Encrypted-at-rest columns

The server never sees plaintext for:

- **email** — XChaCha20-Poly1305 ciphertext + server-keyed HMAC-SHA256 lookup hash
- **vault key** — wrapped by `passwordKEK` and (separately) by `recoveryKEK`

## Env

Create `.env` in this directory:

```
DATABASE_URL=postgres://...
```

(Same value as `apps/server/.env`'s `DATABASE_URL`.)

## Commands

From repo root:

```bash
pnpm db:up         # Start Postgres + Redis via Docker
pnpm db:generate   # Generate migration SQL from schema diffs
pnpm db:migrate    # Apply migrations
```

From this directory:

```bash
bun ./devResetDB.ts   # Nuke + rebuild dev DB
```
