import { type SyncState, type SyncStatus, type SyncSummary, syncCardLines } from "@repo/client";
import type { StatusTone } from "@repo/ui/lib/tone";

export const SYNC_TONE: Record<SyncState, StatusTone> = {
  local: "neutral",
  error: "destructive",
  offline: "warning",
  syncing: "success",
  pending: "success",
  synced: "success",
};

/** The account's sync pill: "Synced just now" when up to date, else what stands in the way. */
export function syncPillLabel(summary: SyncSummary, status: SyncStatus, now: number): string {
  return summary.state === "synced" ? syncCardLines(summary, status, now).detail : summary.title;
}
