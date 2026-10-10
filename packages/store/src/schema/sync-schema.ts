import { and, eq, inArray, like, sql } from "drizzle-orm";
import type { LocalDb } from "../local-db";
import { syncMeta } from "./tables";

// One pull cursor per vault (ADR 0001 D8), so a vault new to this device is
// pulled in full no matter how recently the others were synced. The cursor is
// the highest server `seq` pulled from the vault.
const CURSOR_PREFIX = "pullSeq:";
// Timestamp cursors from before the sequence cursor; dropped on the next pull.
const LEGACY_CURSOR_PREFIX = "lastSyncedAt:";
// A key rotation this device started: its records still to re-encrypt once the
// vault is at the key version stored (`getRekeyTargets`).
const REKEY_PREFIX = "rekey:";

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

/** Drop the vaults' pull cursors and unfinished rotations. */
export async function deleteSyncCursors(vaultIds: readonly string[], db: LocalDb) {
  if (vaultIds.length === 0) return;
  await db.delete(syncMeta).where(
    inArray(
      syncMeta.key,
      vaultIds.flatMap((vaultId) => [CURSOR_PREFIX + vaultId, REKEY_PREFIX + vaultId]),
    ),
  );
}

/** vaultId → the key version whose rotation this device still has records to re-encrypt for. */
export async function getRekeyTargets(db: LocalDb): Promise<Record<string, number>> {
  const rows = await db
    .select()
    .from(syncMeta)
    .where(like(syncMeta.key, `${REKEY_PREFIX}%`));
  return Object.fromEntries(
    rows
      .map((r) => [r.key.slice(REKEY_PREFIX.length), Number(r.value)] as const)
      .filter(([, keyVersion]) => Number.isSafeInteger(keyVersion) && keyVersion > 0),
  );
}

export async function setRekeyTarget(vaultId: string, keyVersion: number, db: LocalDb) {
  await db
    .insert(syncMeta)
    .values({ key: REKEY_PREFIX + vaultId, value: String(keyVersion) })
    .onConflictDoUpdate({ target: syncMeta.key, set: { value: String(keyVersion) } });
}

/** Done with the rotation to `keyVersion` (a later one started meanwhile stays). */
export async function clearRekeyTarget(vaultId: string, keyVersion: number, db: LocalDb) {
  await db
    .delete(syncMeta)
    .where(and(eq(syncMeta.key, REKEY_PREFIX + vaultId), eq(syncMeta.value, String(keyVersion))));
}
