import { db } from "@repo/db";
import { sql } from "drizzle-orm";

/** Wipe every row across users/keys/records. Call in `beforeEach` for isolation. */
export async function truncateAll() {
  await db.execute(sql`TRUNCATE "users", "keys", "records" RESTART IDENTITY CASCADE`);
}
