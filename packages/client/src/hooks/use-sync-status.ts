import { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import type { SyncStatus } from "../sync-manager";
import { formatLastSynced, type SyncSummary, summarizeSync } from "../sync-summary";

const NO_PROFILE: SyncStatus = {
  phase: "offline",
  pending: 0,
  parked: 0,
  error: null,
  lastSyncedAt: null,
  enabled: false,
};

/** Where syncing the active profile with the server stands (ADR 0001 D8), live. */
export function useSyncStatus(): SyncStatus {
  const { syncManager } = useStore();
  return useSyncExternalStore(
    (onChange) => syncManager?.onStatusChange(onChange) ?? (() => {}),
    () => syncManager?.getStatus() ?? NO_PROFILE,
  );
}

/**
 * The sync indicator's data: the status, its summary (`summarizeSync`) and the
 * user's actions. `canSync`: a manual sync can reach the server (online, also
 * after a failed round); `retryParked` queues the parked changes again (and
 * syncs if it can).
 */
export function useSyncSummary(): {
  status: SyncStatus;
  summary: SyncSummary;
  canSync: boolean;
  syncNow: () => void;
  retryParked: () => Promise<void>;
} {
  const { mode, networkOffline } = useContext(SessionContext);
  const { syncManager } = useStore();
  const status = useSyncStatus();
  const summary = summarizeSync(mode, status, networkOffline);
  return {
    status,
    summary,
    canSync:
      summary.state === "synced" ||
      summary.state === "pending" ||
      (summary.state === "error" && status.parked === 0),
    syncNow: () => void syncManager?.sync(),
    retryParked: async () => {
      await syncManager?.retryParked();
    },
  };
}

const LAST_SYNCED_TICK_MS = 30_000;

/** "Last synced 5 minutes ago", kept current while shown; null before the first sync. */
export function useLastSyncedLabel(lastSyncedAt: number | null): string | null {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (lastSyncedAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), LAST_SYNCED_TICK_MS);
    return () => clearInterval(timer);
  }, [lastSyncedAt]);

  return lastSyncedAt === null ? null : formatLastSynced(lastSyncedAt, Math.max(now, lastSyncedAt));
}
