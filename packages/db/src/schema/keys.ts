import type { InferSelectModel } from "drizzle-orm";
import { index, json, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "../utils/columns.helpers";
import type { ArgonParams } from "@repo/schema";

export const keysTable = pgTable(
  "keys",
  {
    keySetId: varchar()
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),

    userId: varchar().notNull(),

    recoveryKekSalt: varchar().notNull().unique(),

    passwordKekParams: json().notNull().$type<ArgonParams>(),
    passwordKekSalt: varchar().notNull().unique(),

    encryptedVaultKey: varchar().notNull().unique(),
    vaultKeyEncryptionNonce: varchar().notNull().unique(),

    encryptedVaultKeyRecovery: varchar().notNull().unique(),
    vaultKeyEncryptionNonceRecovery: varchar().notNull().unique(),

    valid_from: timestamp().defaultNow().notNull(),
    valid_to: timestamp(),

    ...timestamps,
  },
  (table) => [index("key_user_id_idx").on(table.userId)],
);

// TODO: index correct?
export type KeyType = InferSelectModel<typeof keysTable>;
