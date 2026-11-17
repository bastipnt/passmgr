# packages/db — server DB (PostgreSQL, Drizzle)

Run from `packages/db/`:

```bash
bun ./devResetDB.ts   # Reset dev database (truncate data, keep schema)
```

`pnpm db:reset:hard` drops all tables and the migration log, then migrates from scratch (localhost
only). Needed after migrations were squashed into a new baseline; follow with `pnpm db:seed`.

Environment: `DATABASE_URL`, read from `apps/server/.env` (`index.ts`, `drizzle.config.ts`, `devSeed.ts`); the package has no `.env` of its own.
`index.ts` skips that file when `NODE_ENV=production` and throws without `DATABASE_URL`.

Pool (`index.ts`): at most 20 connections, 10 s to get one, `statement_timeout` 30 s,
`idle_in_transaction_session_timeout` 60 s, session `TimeZone=UTC`.

Timestamps are `timestamp` (without time zone) holding UTC, not `timestamptz`: Drizzle reads and writes them as UTC,
and `now()` defaults follow the session `TimeZone`. The stock `postgres` images (dev, test, prod compose) already run
in UTC; the pool pins it so a server configured otherwise can't mix local times in. A switch would rewrite every
table for no change in what is stored; if one is ever needed, `ALTER … TYPE timestamptz USING col AT TIME ZONE 'UTC'`
(and first convert any rows a non-UTC server wrote).

Drizzle is a beta (`1.0.0-beta.15-*`) with the `defineRelationsPart` API — this differs from stable Drizzle docs.
