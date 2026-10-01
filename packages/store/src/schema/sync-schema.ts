import { eq, sql } from "drizzle-orm";
import type { LocalDb } from "../local-db";
import { syncMeta } from "./tables";

const LAST_SYNCED_AT = "lastSyncedAt";

export async function clearSyncTable(db: LocalDb) {
  await db.delete(syncMeta);
}

export async function getLastSyncTimestamp(db: LocalDb): Promise<string | null> {
  const row = await db
    .select({ value: syncMeta.value })
    .from(syncMeta)
    .where(eq(syncMeta.key, LAST_SYNCED_AT))
    .get();
  return row?.value ?? null;
}

export async function setLastSyncTimestamp(ts: string, db: LocalDb): Promise<void> {
  await db
    .insert(syncMeta)
    .values({ key: LAST_SYNCED_AT, value: ts })
    .onConflictDoUpdate({ target: syncMeta.key, set: { value: sql`excluded.value` } });
}
