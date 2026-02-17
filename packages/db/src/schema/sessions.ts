import { InferSelectModel } from "drizzle-orm";
import { index, pgTable, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "../utils/columns.helpers";

export const sessionsTable = pgTable(
  "sessions",
  {
    sessionId: varchar()
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),

    userId: varchar().notNull(),

    sessionKey: varchar().notNull(),

    ...timestamps,
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export type SessionType = InferSelectModel<typeof sessionsTable>;
