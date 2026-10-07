import { useSyncExternalStore } from "react";
import { useStore } from "../providers/StoreProvider";
import type { SyncStatus } from "../sync-manager";

/** Where syncing with the server stands (ADR 0001 D8), live. */
export function useSyncStatus(): SyncStatus {
  const { syncManager } = useStore();
  return useSyncExternalStore(
    (onChange) => syncManager.onStatusChange(onChange),
    () => syncManager.getStatus(),
  );
}
