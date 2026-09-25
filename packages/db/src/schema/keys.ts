import type { ArgonParams } from "@repo/schema";
import { type InferSelectModel, sql } from "drizzle-orm";
import { index, json, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "../utils/columns.helpers";
import { usersTable } from "./users";

export const keysTable = pgTable(
  "keys",
  {
    keySetId: varchar()
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),

    userId: varchar()
      .notNull()
      .references(() => usersTable.userId, { onDelete: "cascade" }),

    // Recovery-side material is copied unchanged into every new key-set version
    // (e.g. a password rekey), so it is not unique across rows.
    recoveryKekSalt: varchar().notNull(),

    passwordKekParams: json().notNull().$type<ArgonParams>(),
    passwordKekSalt: varchar().notNull().unique(),

    encryptedVaultKey: varchar().notNull().unique(),
    vaultKeyEncryptionNonce: varchar().notNull().unique(),

    encryptedVaultKeyRecovery: varchar().notNull(),
    vaultKeyEncryptionNonceRecovery: varchar().notNull(),

    valid_from: timestamp().defaultNow().notNull(),
    valid_to: timestamp(),

    ...timestamps,
  },
  (table) => [
    index("key_user_id_idx").on(table.userId),
    // Key sets are versioned (valid_from / valid_to); at most one is active per user.
    uniqueIndex("key_active_user_idx")
      .on(table.userId)
      .where(sql`${table.valid_to} IS NULL AND ${table.deleted_at} IS NULL`),
  ],
);

export type KeyType = InferSelectModel<typeof keysTable>;
