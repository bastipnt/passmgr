import { sql } from "drizzle-orm";
import { db } from "@repo/db";

/** Wipe every row across users/keys/records. Call in `beforeEach` for isolation. */
export async function truncateAll() {
  await db.execute(sql`TRUNCATE "users", "keys", "records" RESTART IDENTITY CASCADE`);
}
