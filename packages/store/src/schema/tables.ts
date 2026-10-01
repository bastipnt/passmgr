import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Column names match `EncryptedRecordSchema`, so rows map onto it without renaming.
export const records = sqliteTable(
  "records",
  {
    recordId: text().notNull(),

    encryptedData: text().notNull(),
    encryptionNonce: text().notNull(),

    cryptoVersion: integer().notNull().default(1),
    version: integer().notNull().default(1),

    clientUpdatedAt: text().notNull(),
    created_at: text(),
    updated_at: text(),
    deleted_at: text(),
  },
  (t) => [primaryKey({ columns: [t.recordId, t.version] })],
);

/** Key/value store for the wrapped vault key and biometric key material. */
export const keyMaterial = sqliteTable("key_material", {
  key: text().primaryKey(),
  value: text().notNull(),
});

export const syncMeta = sqliteTable("sync_meta", {
  key: text().primaryKey(),
  value: text().notNull(),
});
