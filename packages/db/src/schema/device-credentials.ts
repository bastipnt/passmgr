import type { InferSelectModel } from "drizzle-orm";
import { bigint, index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * A device's WebAuthn credential that logs in to the account (web biometric
 * unlock). Holds only the public key: the private key never leaves the
 * authenticator. No attestation is checked; registering one needs a fresh
 * password login.
 */
export const deviceCredentialsTable = pgTable(
  "device_credentials",
  {
    // base64 of the WebAuthn credential id (raw id).
    credentialId: varchar().primaryKey(),
    userId: varchar()
      .notNull()
      .references(() => usersTable.userId, { onDelete: "cascade" }),

    // SubjectPublicKeyInfo (DER), base64, and its COSE algorithm.
    publicKey: varchar().notNull(),
    algorithm: integer().notNull(),
    // The authenticator's signature counter: a value that doesn't grow means a cloned credential.
    signCount: bigint({ mode: "number" }).notNull().default(0),

    // The last password login that vouched for it (registration, or a password
    // login on the device): device logins stop SESSION_MAX_AGE_MS after it.
    passwordVerifiedAt: timestamp().defaultNow().notNull(),

    deviceName: varchar(),
    lastUsedAt: timestamp(),
    created_at: timestamp().defaultNow().notNull(),
  },
  (table) => [index().on(table.userId)],
);

export type DeviceCredentialType = InferSelectModel<typeof deviceCredentialsTable>;
