import { useSyncExternalStore } from "react";
import { useStore } from "../providers/StoreProvider";
import type { SyncStatus } from "../sync-manager";

const NO_PROFILE: SyncStatus = {
  phase: "offline",
  pending: 0,
  parked: 0,
  error: null,
  lastSyncedAt: null,
};

/** Where syncing the active profile with the server stands (ADR 0001 D8), live. */
export function useSyncStatus(): SyncStatus {
  const { syncManager } = useStore();
  return useSyncExternalStore(
    (onChange) => syncManager?.onStatusChange(onChange) ?? (() => {}),
    () => syncManager?.getStatus() ?? NO_PROFILE,
  );
}
