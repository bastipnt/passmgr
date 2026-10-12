import type { InferSelectModel } from "drizzle-orm";
import { pgTable, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "../utils/columns.helpers";

export const usersTable = pgTable("users", {
  userId: varchar()
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey(),

  encryptedEmail: varchar().notNull().unique(),
  emailNonce: varchar().notNull(),
  emailEncryptionKeySalt: varchar().notNull(),

  emailHash: varchar().notNull().unique(),

  registrationRecord: varchar().notNull().unique(),

  ...timestamps,
});

export type UserType = InferSelectModel<typeof usersTable>;
