import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Column names match `EncryptedRecordSchema`, so rows map onto it without renaming.
export const records = sqliteTable(
  "records",
  {
    recordId: text().notNull(),
    vaultId: text().notNull(),

    encryptedData: text().notNull(),
    encryptionNonce: text().notNull(),

    cryptoVersion: integer().notNull().default(1),
    version: integer().notNull().default(1),

    clientUpdatedAt: text().notNull(),
    created_at: text(),
    updated_at: text(),
    deleted_at: text(),
  },
  (t) => [
    primaryKey({ columns: [t.recordId, t.version] }),
    index("records_vault_idx").on(t.vaultId),
  ],
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

/**
 * The vaults the user is a member of (ADR 0001 D6): their key wrapped under the
 * account key (cached for offline unlock), the user's role, and the metadata
 * encrypted with the vault key. Column names match `MemberVault`.
 */
export const vaults = sqliteTable("vaults", {
  vaultId: text().primaryKey(),
  kind: text({ enum: ["personal", "shared"] }).notNull(),
  role: text({ enum: ["owner", "manage", "write", "read"] }).notNull(),
  keyVersion: integer().notNull(),
  encryptedVaultKey: text().notNull(),
  vaultKeyEncryptionNonce: text().notNull(),
  encryptedMeta: text().notNull(),
  metaEncryptionNonce: text().notNull(),
});

/**
 * The device profile (ADR 0001 D2): at most one row, the one user of this
 * device. `local` has no account yet; `linked` belongs to the account
 * `userId` / `email`. Separate from the session: the profile says whose vault
 * this is, the session whether it is unlocked and talking to the server.
 */
export const profile = sqliteTable("profile", {
  profileId: text().primaryKey(),
  mode: text({ enum: ["local", "linked"] }).notNull(),
  email: text(),
  userId: text(),
});
