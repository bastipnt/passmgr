import type { InferSelectModel } from "drizzle-orm";
import { bigint, index, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * A user's TOTP second factor for the server login. A row means two-factor is
 * on; no row, password-only. The secret is encrypted at rest with a key
 * derived from the server key (`OPAQUE_SERVER_SETUP`).
 */
export const userTotpTable = pgTable("user_totp", {
  userId: varchar()
    .primaryKey()
    .references(() => usersTable.userId, { onDelete: "cascade" }),

  encryptedSecret: varchar().notNull(),
  secretNonce: varchar().notNull(),

  // RFC 6238 time step of the last accepted code: a code at or below it is a replay.
  lastUsedStep: bigint({ mode: "number" }),

  created_at: timestamp().defaultNow().notNull(),
});

/** Single-use backup codes for a lost authenticator; only a keyed hash is stored. */
export const userBackupCodesTable = pgTable(
  "user_backup_codes",
  {
    id: varchar()
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    userId: varchar()
      .notNull()
      .references(() => usersTable.userId, { onDelete: "cascade" }),

    codeHash: varchar().notNull(),
    usedAt: timestamp(),

    created_at: timestamp().defaultNow().notNull(),
  },
  (table) => [index().on(table.userId)],
);

export type UserTotpType = InferSelectModel<typeof userTotpTable>;
