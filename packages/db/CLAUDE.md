# packages/db — server DB (PostgreSQL, Drizzle)

Run from `packages/db/`:

```bash
bun ./devResetDB.ts   # Reset dev database (truncate data, keep schema)
```

`pnpm db:reset:hard` drops all tables and the migration log, then migrates from scratch (localhost
only). Needed after migrations were squashed into a new baseline; follow with `pnpm db:seed`.

Deployed migrations: `migrate.ts` (drizzle-orm's migrator, same `drizzle.__drizzle_migrations` rows as
`drizzle-kit migrate`) runs as the owner role, then creates / updates `APP_DB_USER` (`passmgr_app`): login, DML on every
table in `public`, no DDL, never superuser. The server connects only as that role (compose `migrate` service, its image
has no drizzle-kit). It runs before every deploy, so the grants cover tables new migrations add:
`DATABASE_URL=<owner url> APP_DB_USER=passmgr_app APP_DB_PASSWORD=… bun packages/db/migrate.ts`. A migration that needs
a new privilege for the app (a sequence elsewhere, a function) must add it to `grantAppRole`. The deploy migrates while
the previous release still serves, so a migration must work with the old server too (expand first; drop or rename a
column only a release after the code stops using it). Dev keeps `pnpm db:migrate` (drizzle-kit) and the superuser.

Environment: `DATABASE_URL`, read from `apps/server/.env` (`index.ts`, `drizzle.config.ts`, `devSeed.ts`); the package
has no `.env` of its own. `index.ts` skips that file when `NODE_ENV=production` and throws without `DATABASE_URL`.

Pool (`index.ts`): at most 20 connections, 10 s to get one, `statement_timeout` 30 s,
`idle_in_transaction_session_timeout` 60 s, session `TimeZone=UTC`.

Timestamps are `timestamp` (without time zone) holding UTC, not `timestamptz`: Drizzle reads and writes them as UTC,
and `now()` defaults follow the session `TimeZone`. The stock `postgres` images (dev, test, prod compose) already run
in UTC; the pool pins it so a server configured otherwise can't mix local times in. A switch would rewrite every
table for no change in what is stored; if one is ever needed, `ALTER … TYPE timestamptz USING col AT TIME ZONE 'UTC'`
(and first convert any rows a non-UTC server wrote).

Drizzle is a beta (`1.0.0-beta.15-*`) with the `defineRelationsPart` API — this differs from stable Drizzle docs.
