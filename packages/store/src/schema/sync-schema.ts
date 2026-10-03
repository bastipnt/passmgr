import { inArray, like, sql } from "drizzle-orm";
import type { LocalDb } from "../local-db";
import { syncMeta } from "./tables";

// One pull cursor per vault (ADR 0001 D8), so a vault new to this device is
// pulled in full no matter how recently the others were synced.
const CURSOR_PREFIX = "lastSyncedAt:";

export async function clearSyncTable(db: LocalDb) {
  await db.delete(syncMeta);
}

/** vaultId → cursor, for every vault synced before. */
export async function getSyncCursors(db: LocalDb): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(syncMeta)
    .where(like(syncMeta.key, `${CURSOR_PREFIX}%`));
  return Object.fromEntries(rows.map((r) => [r.key.slice(CURSOR_PREFIX.length), r.value]));
}

export async function setSyncCursors(
  vaultIds: readonly string[],
  cursor: string,
  db: LocalDb,
): Promise<void> {
  if (vaultIds.length === 0) return;
  await db
    .insert(syncMeta)
    .values(vaultIds.map((vaultId) => ({ key: CURSOR_PREFIX + vaultId, value: cursor })))
    .onConflictDoUpdate({ target: syncMeta.key, set: { value: sql`excluded.value` } });
}

export async function deleteSyncCursors(vaultIds: readonly string[], db: LocalDb) {
  if (vaultIds.length === 0) return;
  await db.delete(syncMeta).where(
    inArray(
      syncMeta.key,
      vaultIds.map((vaultId) => CURSOR_PREFIX + vaultId),
    ),
  );
}
