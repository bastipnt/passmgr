import type { SyncManager } from "../sync-manager";

/**
 * Change vaults on the server, then sync in a fresh round: a pull from before the change
 * (create, rename, delete, key rotation) would undo it on the device.
 */
export async function changeVaultOnServer<T>(
  syncManager: Pick<SyncManager, "syncFresh">,
  change: () => Promise<T>,
): Promise<T> {
  const result = await change();
  await syncManager.syncFresh();
  return result;
}
