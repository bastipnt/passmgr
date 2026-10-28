# packages/db — server DB (PostgreSQL, Drizzle)

Run from `packages/db/`:

```bash
bun ./devResetDB.ts   # Reset dev database (truncate data, keep schema)
```

`pnpm db:reset:hard` drops all tables and the migration log, then migrates from scratch (localhost
only). Needed after migrations were squashed into a new baseline; follow with `pnpm db:seed`.

Environment (`packages/db/.env`): `DATABASE_URL`.

Drizzle is a beta (`1.0.0-beta.15-*`) with the `defineRelationsPart` API — this differs from stable Drizzle docs.
