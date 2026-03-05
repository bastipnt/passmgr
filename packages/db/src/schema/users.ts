import { defineRelationsPart, type InferSelectModel } from "drizzle-orm";
import { boolean, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "../utils/columns.helpers";
import { keysTable } from "./keys";

export const usersTable = pgTable("users", {
  userId: varchar()
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),

  encryptedEmail: varchar().notNull().unique(),
  emailNonce: varchar().notNull(),
  emailEncryptionKeySalt: varchar().notNull(),

  emailHash: varchar().notNull().unique(),

  registrationRecord: varchar().notNull().unique(),

  hasTwoFactorEnabled: boolean()
    .notNull()
    .$defaultFn(() => false),

  hasEmailVerified: boolean()
    .notNull()
    .$defaultFn(() => true), // TODO: set to false

  lastLoginAt: timestamp(),

  ...timestamps,
});

export type UserType = InferSelectModel<typeof usersTable>;

export const usersKeysRelations = defineRelationsPart({ usersTable, keysTable }, (r) => ({
  usersTable: {
    key: r.one.keysTable({
      from: r.usersTable.userId,
      to: r.keysTable.userId,
      where: {
        valid_to: { isNull: true },
      },
    }),
  },
}));
