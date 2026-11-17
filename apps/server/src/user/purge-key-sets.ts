import { db, keysTable } from "@repo/db";
import { lt } from "drizzle-orm";
import { serverEnv } from "../env";
import { DAY_MS } from "../util/time";

export const KEY_SET_RETENTION_MS = serverEnv.KEY_SET_RETENTION_DAYS * DAY_MS;

/**
 * Delete key sets closed more than `retentionMs` ago. The account key never
 * changes, so a closed set still opens it with the old password or the old
 * recovery key; keeping it would let a later database leak be cracked with
 * a password the user already replaced. Nothing reads a closed set: login,
 * recovery and password change only ever use the active one.
 */
export async function purgeClosedKeySets(
  now = Date.now(),
  retentionMs = KEY_SET_RETENTION_MS,
): Promise<number> {
  const purged = await db
    .delete(keysTable)
    .where(lt(keysTable.valid_to, new Date(now - retentionMs)))
    .returning({ keySetId: keysTable.keySetId });
  return purged.length;
}
