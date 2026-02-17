import { defineRelationsPart, InferSelectModel } from "drizzle-orm";
import { boolean, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { loginsTable } from "./logins";
import { timestamps } from "../utils/columns.helpers";
import { sessionsTable } from "./sessions";

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

export const usersLoginsRelations = defineRelationsPart({ usersTable, loginsTable }, (r) => ({
  loginsTable: {
    user: r.one.usersTable({
      from: r.loginsTable.userId,
      to: r.usersTable.userId,
      where: {
        hasEmailVerified: true,
      },
    }),
  },
}));

export const usersSessionsRelations = defineRelationsPart({ usersTable, sessionsTable }, (r) => ({
  sessionsTable: {
    user: r.one.usersTable({
      from: r.sessionsTable.userId,
      to: r.usersTable.userId,
      where: {
        hasEmailVerified: true,
      },
    }),
  },
}));

export type UserType = InferSelectModel<typeof usersTable>;
