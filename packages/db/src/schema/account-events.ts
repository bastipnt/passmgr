import type { AccountEventType } from "@repo/schema";
import type { InferSelectModel } from "drizzle-orm";
import { bigint, boolean, index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * The account's security activity, shown to its owner (logins, failed logins,
 * key and second-factor changes, devices). Holds no IP address and nothing
 * secret. The device name is sealed to the user's public key, so a copy of the
 * database doesn't show which devices someone uses; the server keeps only a
 * keyed hash of it, to spot a new device.
 */
export const accountEventsTable = pgTable(
  "account_events",
  {
    // Ascending: the list's paging cursor.
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar()
      .notNull()
      .references(() => usersTable.userId, { onDelete: "cascade" }),

    type: varchar().notNull().$type<AccountEventType>(),
    sealedDeviceName: varchar(),
    // The user keypair version the name is sealed to.
    deviceKeyVersion: integer(),
    deviceNameHash: varchar(),
    // A login from a device name the owner hasn't used before (a hint: the name is the client's own).
    newDevice: boolean().notNull().default(false),

    created_at: timestamp().defaultNow().notNull(),
  },
  (table) => [index().on(table.userId, table.id), index().on(table.userId, table.deviceNameHash)],
);

export type AccountEventRow = InferSelectModel<typeof accountEventsTable>;
