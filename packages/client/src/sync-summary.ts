import type { SessionMode } from "./providers/SessionProvider";
import type { SyncStatus } from "./sync-manager";

/**
 * What a sync indicator shows (ADR 0001 D8), most pressing first:
 * - `local`: a vault without an account, nothing to sync with
 * - `error`: the last round failed, or changes are parked
 * - `syncing`: a round is running
 * - `offline`: no server right now (or it won't sync until the email is
 *   verified); writes keep working and wait in the outbox
 * - `pending`: changes waiting for the next round
 * - `synced`: the server has everything
 */
export type SyncState = "local" | "error" | "syncing" | "offline" | "pending" | "synced";

export type SyncSummary = {
  state: SyncState;
  title: string;
  detail: string;
  /** A demo vault (`local`): it can't get an account either. */
  demo?: boolean;
};

/** What a demo vault says wherever an account or sync would be offered. */
export const DEMO_VAULT_NOTICE =
  "This vault only lives in this browser and can't be synced or linked to an account. Don't store real passwords here.";

function changes(count: number): string {
  return count === 1 ? "1 change" : `${count} changes`;
}

/**
 * The sync indicator's state and copy for a session and its sync status.
 * `networkOffline`: the device has no network, whatever the sync status says.
 * `pendingRecovery`: a password reset made on this device waits for the server.
 * `demo`: the profile is a demo vault.
 */
export function summarizeSync(
  mode: SessionMode | null | undefined,
  status: SyncStatus,
  networkOffline: boolean,
  pendingRecovery = false,
  demo = false,
): SyncSummary {
  if (demo)
    return { state: "local", title: "Demo (local only)", detail: DEMO_VAULT_NOTICE, demo: true };
  if (mode === "local" || !mode)
    return {
      state: "local",
      title: "On this device only",
      detail:
        "This vault has no account, so nothing syncs. Create an online account to back it up and use it on other devices.",
    };

  if (status.vaultsMissing.length > 0)
    return {
      state: "error",
      title: "Vaults missing on the server",
      detail: `The server no longer lists ${status.vaultsMissing.length} vaults this device holds, so nothing was synced or removed. Remove them from this device only if you expect it (you were removed from them, or they were deleted).`,
    };

  if (status.vaultListRejected)
    return {
      state: "error",
      title: "Sync stopped",
      detail:
        "The server sent a vault list that doesn't match this device's (an older vault key, or another personal vault), so nothing of it was applied. It retries by itself; if this keeps happening, don't trust the server.",
    };

  if (status.parked > 0 && status.storageFull)
    return {
      state: "error",
      title: "Storage full",
      detail: `${changes(status.parked)} couldn't be uploaded: the vault's owner has used up their storage. Delete items for good from the trash, then retry.`,
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

  if (status.paused && !networkOffline)
    return {
      state: "offline",
      title: "Sync paused",
      detail:
        "Verify your email address to start syncing: enter the code we sent you in Account & sync. Everything you do is saved on this device meanwhile.",
    };

  if (offline && pendingRecovery)
    return {
      state: "offline",
      title: "Password reset waiting",
      detail:
        "Your new password works on this device. Your account switches to it once the server is reachable; until then nothing syncs.",
    };

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

// Not Intl.RelativeTimeFormat: Hermes (React Native) doesn't implement it.
function ago(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}

/** "just now / 5 minutes ago / yesterday / 3 days ago" for a time (ms since epoch). */
export function formatTimeAgo(at: number, now = Date.now()): string {
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return ago(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return ago(hours, "hour");
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : ago(days, "day");
}

/** "Last synced just now / 5 minutes ago / …" for a sync time (ms since epoch). */
export function formatLastSynced(at: number, now = Date.now()): string {
  return `Last synced ${formatTimeAgo(at, now)}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** "14:32" for a time today, else its date ("12 Oct"), in the device's locale. */
export function formatClock(at: number, now = Date.now()): string {
  const date = new Date(at);
  return sameDay(date, new Date(now))
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * The two lines of a compact sync card (the web sidebar's): whether this device
 * talks to the server, then the one thing worth knowing about it.
 */
export function syncCardLines(
  summary: SyncSummary,
  status: SyncStatus,
  now = Date.now(),
): { title: string; detail: string } {
  const { lastSyncedAt } = status;
  switch (summary.state) {
    case "local":
      return summary.demo
        ? { title: "Demo", detail: "Local only" }
        : { title: "On this device", detail: "No sync" };
    case "synced":
      return {
        title: "Online",
        detail: lastSyncedAt === null ? "Up to date" : `Synced ${formatTimeAgo(lastSyncedAt, now)}`,
      };
    case "pending":
    case "syncing":
      return { title: "Online", detail: summary.title };
    case "offline":
      return {
        title: summary.title,
        detail:
          status.pending > 0
            ? `${changes(status.pending)} waiting`
            : lastSyncedAt === null
              ? "Not synced yet"
              : `Last synced ${formatClock(lastSyncedAt, now)}`,
      };
    case "error":
      return {
        title: summary.title,
        detail: lastSyncedAt === null ? "Not synced yet" : formatLastSynced(lastSyncedAt, now),
      };
  }
}
