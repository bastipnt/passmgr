import type { SessionMode } from "./providers/SessionProvider";
import type { SyncStatus } from "./sync-manager";

/**
 * What a sync indicator shows (ADR 0001 D8), most pressing first:
 * - `local`: a vault without an account, nothing to sync with
 * - `error`: the last round failed, or changes are parked
 * - `syncing`: a round is running
 * - `offline`: no server right now; writes keep working and wait in the outbox
 * - `pending`: changes waiting for the next round
 * - `synced`: the server has everything
 */
export type SyncState = "local" | "error" | "syncing" | "offline" | "pending" | "synced";

export type SyncSummary = {
  state: SyncState;
  title: string;
  detail: string;
};

function changes(count: number): string {
  return count === 1 ? "1 change" : `${count} changes`;
}

/**
 * The sync indicator's state and copy for a session and its sync status.
 * `networkOffline`: the device has no network, whatever the sync status says.
 */
export function summarizeSync(
  mode: SessionMode | null | undefined,
  status: SyncStatus,
  networkOffline: boolean,
): SyncSummary {
  if (mode === "local" || !mode)
    return {
      state: "local",
      title: "On this device only",
      detail:
        "This vault has no account, so nothing syncs. Create an online account to back it up and use it on other devices.",
    };

  if (status.parked > 0)
    return {
      state: "error",
      title: "Some changes didn't sync",
      detail: `${changes(status.parked)} couldn't be uploaded. They stay on this device until you retry.`,
    };

  // Online but the manager not enabled yet (sign-in, unlock): about to sync, not offline.
  const offline =
    networkOffline || mode === "offline" || (status.phase === "offline" && status.enabled);
  if (status.phase === "error" && !offline)
    return {
      state: "error",
      title: "Sync failed",
      detail: "The last sync didn't go through. It retries by itself.",
    };

  if (status.phase === "syncing")
    return { state: "syncing", title: "Syncing…", detail: "Exchanging changes with the server." };

  if (offline) {
    const waiting =
      status.pending > 0
        ? `${changes(status.pending)} saved on this device. `
        : "Everything you do is saved on this device. ";
    return {
      state: "offline",
      title: networkOffline ? "Offline" : "Not connected",
      detail: `${waiting}${networkOffline ? "It syncs once you're back online." : "It syncs once the server is reachable again."}`,
    };
  }

  if (status.pending > 0)
    return {
      state: "pending",
      title: `${changes(status.pending)} waiting`,
      detail: "Saved on this device, uploading shortly.",
    };

  return { state: "synced", title: "Synced", detail: "Your account has every change." };
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "Last synced just now / 5 minutes ago / …" for a sync time (ms since epoch). */
export function formatLastSynced(at: number, now = Date.now()): string {
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 60) return "Last synced just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Last synced ${RELATIVE.format(-minutes, "minute")}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Last synced ${RELATIVE.format(-hours, "hour")}`;
  return `Last synced ${RELATIVE.format(-Math.round(hours / 24), "day")}`;
}
