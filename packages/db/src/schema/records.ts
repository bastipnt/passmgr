import { index, integer, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "../utils/columns.helpers";
import type { InferSelectModel } from "drizzle-orm";

export const recordsTable = pgTable(
  "records",
  {
    rowId: varchar()
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    recordId: varchar().notNull(),
    userId: varchar().notNull(),
    encryptedData: varchar().notNull(),
    encryptionNonce: varchar().notNull(),
    cryptoVersion: integer().notNull().default(1),
    version: integer().notNull().default(1),
    clientUpdatedAt: timestamp().notNull(),
    ...timestamps,
  },
  (table) => [
    index("records_user_id_idx").on(table.userId),
    index("records_record_id_idx").on(table.recordId),
    uniqueIndex("records_record_id_version_idx").on(table.recordId, table.version),
    index("records_user_record_version_idx").on(table.userId, table.recordId, table.version),
    index("records_user_updated_at_idx").on(table.userId, table.updated_at),
  ],
);

export type RecordType = InferSelectModel<typeof recordsTable>;
