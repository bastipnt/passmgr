import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * The device's profile registry (ADR 0001 D2, amended 2026-10-07): one row per
 * profile on this device, in its own small database next to the per-profile
 * ones. It says which profiles exist and where their data lives; it holds no
 * key material. `mode`, `email` and `userId` mirror the profile's own
 * `profile` row (the source of truth, written with its key material), so the
 * unlock screen can list them without opening every database.
 */
export const profiles = sqliteTable(
  "profiles",
  {
    profileId: text().primaryKey(),
    mode: text({ enum: ["local", "linked"] }).notNull(),
    /** Normalized; linked profiles only. */
    email: text(),
    /** Linked profiles only. One profile per account. */
    userId: text().unique(),
    /** Tells local vaults apart; optional. */
    name: text(),
    /** The profile's database, without extension (the driver adds it). */
    databaseName: text().notNull().unique(),
    createdAt: text().notNull(),
    lastUsedAt: text().notNull(),
    /** The last export of this profile's data from this device; null if never (backup reminder, ADR 0001 D12). */
    lastExportAt: text(),
  },
  (t) => [index("profiles_email_idx").on(t.email)],
);

/** Device-level facts the registry keeps, e.g. one-time cleanups done. */
export const registryMeta = sqliteTable("registry_meta", {
  key: text().primaryKey(),
  value: text().notNull(),
});
