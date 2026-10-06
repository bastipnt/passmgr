import type { InferSelectModel } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { timestamps } from "../utils/columns.helpers";
import { usersTable } from "./users";
import { vaultsTable } from "./vaults";

export const recordsTable = pgTable(
  "records",
  {
    rowId: varchar()
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    recordId: varchar().notNull(),
    // Access goes through vault membership (ADR 0001 D6). Every version of a
    // record stays in the vault it was created in; a move is a new record.
    vaultId: varchar()
      .notNull()
      .references(() => vaultsTable.vaultId, { onDelete: "cascade" }),
    // The author of this version.
    userId: varchar()
      .notNull()
      .references(() => usersTable.userId, { onDelete: "cascade" }),
    encryptedData: varchar().notNull(),
    encryptionNonce: varchar().notNull(),
    cryptoVersion: integer().notNull().default(1),
    version: integer().notNull().default(1),
    clientUpdatedAt: timestamp().notNull(),
    // The vault's write order, the pull cursor (ADR 0001 D8): taken from
    // `vaults.lastSeq` in the writing transaction (`nextVaultSeqs`).
    seq: bigint({ mode: "number" }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("records_user_id_idx").on(table.userId),
    uniqueIndex("records_record_id_version_idx").on(table.recordId, table.version),
    index("records_vault_record_version_idx").on(table.vaultId, table.recordId, table.version),
    uniqueIndex("records_vault_seq_idx").on(table.vaultId, table.seq),
  ],
);

export type RecordType = InferSelectModel<typeof recordsTable>;
