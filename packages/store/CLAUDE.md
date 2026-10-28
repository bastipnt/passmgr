# packages/store — local (on-device) DB

```bash
pnpm --filter @repo/store migrations:generate   # after editing src/schema/tables.ts
```

One SQLite database **per profile** (`Vault`) plus a device-level profile registry (`ProfileStore`,
`src/profiles.ts`; ADR 0001 D2, amended 2026-10-07). Drizzle (sqlite) schema in `src/schema/tables.ts`
(profile DB) and `src/schema/registry-tables.ts` (registry); drizzle-kit writes `drizzle/` and
`drizzle-registry/`, bundled into `src/migrations.generated.ts` / `src/registry-migrations.generated.ts`
(never edit either by hand; a test fails if they drift). Our own runner (`src/migrations.ts`,
`PRAGMA user_version`) applies them. Queries go through
`drizzle-orm/sqlite-proxy` over `SqlDriver` (array rows). **Never use Drizzle's `db.transaction()`**:
it can't isolate a proxied connection. Use `SqlDriver.transaction` (`Vault.transaction`).

What a device copy exposes: `docs/security/threat-model-inputs.md` — keep it current when on-device storage or key
caching changes.
