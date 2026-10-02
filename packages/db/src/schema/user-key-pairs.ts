import type { InferSelectModel } from "drizzle-orm";
import { integer, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * A user's X25519 keypair for sharing (ADR 0001 D7). The public key is handed
 * to other users so they can seal a vault key to it; the private key is wrapped
 * under the user's account key (opaque to the server). Rows are append-only:
 * a rotation adds the next `keyVersion`, the highest one is current.
 */
export const userKeyPairsTable = pgTable(
  "user_key_pairs",
  {
    userId: varchar()
      .notNull()
      .references(() => usersTable.userId, { onDelete: "cascade" }),
    keyVersion: integer().notNull(),

    publicKey: varchar().notNull().unique(),
    encryptedPrivateKey: varchar().notNull().unique(),
    privateKeyEncryptionNonce: varchar().notNull().unique(),

    created_at: timestamp().defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.keyVersion] })],
);

export type UserKeyPairType = InferSelectModel<typeof userKeyPairsTable>;
