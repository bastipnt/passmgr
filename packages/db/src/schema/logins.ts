import { InferSelectModel } from "drizzle-orm";
import { index, pgTable, varchar } from "drizzle-orm/pg-core";
import { timestamps } from "../utils/columns.helpers";

export const loginsTable = pgTable(
  "logins",
  {
    loginId: varchar()
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),

    userId: varchar().notNull().unique(),

    serverLoginState: varchar().notNull(),

    ...timestamps,
  },
  (table) => [index("login_user_id_idx").on(table.userId)],
);

export type LoginType = InferSelectModel<typeof loginsTable>;
