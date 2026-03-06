import { index, integer, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "../utils/columns.helpers";
import type { InferSelectModel } from "drizzle-orm";

export const itemsTable = pgTable(
  "items",
  {
    rowId: varchar().$defaultFn(() => crypto.randomUUID()).primaryKey(),
    itemId: varchar().notNull(),
    userId: varchar().notNull(),
    encryptedData: varchar().notNull(),
    encryptionNonce: varchar().notNull(),
    cryptoVersion: integer().notNull().default(1),
    version: integer().notNull().default(1),
    clientUpdatedAt: timestamp().notNull(),
    ...timestamps,
  },
  (table) => [
    index("items_user_id_idx").on(table.userId),
    index("items_item_id_idx").on(table.itemId),
    uniqueIndex("items_item_id_version_idx").on(table.itemId, table.version),
    index("items_user_item_version_idx").on(table.userId, table.itemId, table.version),
    index("items_user_updated_at_idx").on(table.userId, table.updated_at),
  ],
);

export type ItemType = InferSelectModel<typeof itemsTable>;
