import type { VaultKeyLink } from "@repo/schema";
import { sql } from "drizzle-orm";
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
    // The vault key version the ciphertext is encrypted with.
    keyVersion: integer().notNull().default(1),
    version: integer().notNull().default(1),

    clientUpdatedAt: text().notNull(),
    created_at: text(),
    updated_at: text(),
    deleted_at: text(),

    // `pending`: written on this device and not acknowledged by the server yet
    // (it has an `outbox` entry); its version is provisional (ADR 0001 D5).
    syncState: text({ enum: ["synced", "pending"] })
      .notNull()
      .default("synced"),
  },
  (t) => [
    primaryKey({ columns: [t.recordId, t.version] }),
    index("records_vault_idx").on(t.vaultId),
  ],
);

/**
 * Local record versions waiting to be pushed (ADR 0001 D8), in write order
 * (`seq`). Each entry points at its `pending` row in `records`, written in the
 * same transaction. `changeId` identifies the change to the server (retries).
 * `parkedAt`: the change kept failing or was rejected; it (and its record's
 * later changes) isn't pushed again until the user retries it.
 */
export const outbox = sqliteTable(
  "outbox",
  {
    seq: integer().primaryKey(),
    changeId: text().notNull().unique(),
    recordId: text().notNull(),
    version: integer().notNull(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    parkedAt: text(),
    createdAt: text().notNull(),
  },
  (t) => [index("outbox_record_idx").on(t.recordId, t.version)],
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
 * The vaults the user is a member of (ADR 0001 D6): their current key wrapped
 * under the account key (cached for offline unlock), the earlier keys wrapped
 * under the ones that replaced them, the user's role, and the metadata
 * encrypted with the vault key. Column names match `MemberVault`.
 */
export const vaults = sqliteTable("vaults", {
  vaultId: text().primaryKey(),
  kind: text({ enum: ["personal", "shared"] }).notNull(),
  role: text({ enum: ["owner", "manage", "write", "read"] }).notNull(),
  keyVersion: integer().notNull(),
  encryptedVaultKey: text().notNull(),
  vaultKeyEncryptionNonce: text().notNull(),
  previousKeys: text({ mode: "json" }).$type<VaultKeyLink[]>().notNull().default(sql`'[]'`),
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
