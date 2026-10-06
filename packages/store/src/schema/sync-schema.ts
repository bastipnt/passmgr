import { inArray, like, sql } from "drizzle-orm";
import type { LocalDb } from "../local-db";
import { syncMeta } from "./tables";

// One pull cursor per vault (ADR 0001 D8), so a vault new to this device is
// pulled in full no matter how recently the others were synced. The cursor is
// the highest server `seq` pulled from the vault.
const CURSOR_PREFIX = "pullSeq:";
// Timestamp cursors from before the sequence cursor; dropped on the next pull.
const LEGACY_CURSOR_PREFIX = "lastSyncedAt:";

export async function clearSyncTable(db: LocalDb) {
  await db.delete(syncMeta);
}

/**
 * vaultId → cursor, for every vault synced before. A value that isn't a valid
 * cursor is skipped (that vault is pulled in full) rather than sent: the server
 * would reject the whole pull, every time.
 */
export async function getSyncCursors(db: LocalDb): Promise<Record<string, number>> {
  const rows = await db
    .select()
    .from(syncMeta)
    .where(like(syncMeta.key, `${CURSOR_PREFIX}%`));
  return Object.fromEntries(
    rows
      .map((r) => [r.key.slice(CURSOR_PREFIX.length), Number(r.value)] as const)
      .filter(([, cursor]) => Number.isSafeInteger(cursor) && cursor >= 0),
  );
}

/** Store the cursors (vaultId → cursor) of the vaults in `cursors`. */
export async function setSyncCursors(cursors: Record<string, number>, db: LocalDb): Promise<void> {
  await db.delete(syncMeta).where(like(syncMeta.key, `${LEGACY_CURSOR_PREFIX}%`));
  const entries = Object.entries(cursors);
  if (entries.length === 0) return;
  await db
    .insert(syncMeta)
    .values(
      entries.map(([vaultId, cursor]) => ({ key: CURSOR_PREFIX + vaultId, value: String(cursor) })),
    )
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
