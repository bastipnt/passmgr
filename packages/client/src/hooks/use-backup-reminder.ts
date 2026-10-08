import type { ProfileEntry } from "@repo/store";
import { useCallback, useEffect, useState } from "react";
import { backupReminderSnoozedKey } from "../preferences/preference-keys";
import { useStore } from "../providers/StoreProvider";
import { usePreference } from "./use-preference";

/** How long a local-only vault goes without a backup before the reminder shows (again). */
export const BACKUP_REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A local-only profile (ADR 0001 D12) is due a backup reminder once the
 * interval has passed since the latest of: its creation, its last export, the
 * last time the reminder was put off. Linked profiles have the server copy.
 * A time in the future (a clock that was ahead) is ignored, or it would hold
 * the reminder back until then.
 */
export function isBackupReminderDue(
  entry: Pick<ProfileEntry, "mode" | "createdAt" | "lastExportAt">,
  snoozedAt: string | null,
  now: Date = new Date(),
): boolean {
  if (entry.mode !== "local") return false;
  const nowMs = now.getTime();
  const since = [entry.createdAt, entry.lastExportAt, snoozedAt]
    .map((at) => (at ? Date.parse(at) : Number.NaN))
    .filter((at) => !Number.isNaN(at) && at <= nowMs);
  if (since.length === 0) return false;
  return nowMs - Math.max(...since) >= BACKUP_REMINDER_INTERVAL_MS;
}

/** Re-checks while a vault stays open, so the reminder comes due without a re-render. */
const RECHECK_MS = 60 * 60 * 1000;

/**
 * The current time, refreshed every `RECHECK_MS` and whenever the page becomes
 * visible again (timers sleep in a background tab or a suspended app).
 */
function useNow(): [Date, () => void] {
  const [now, setNow] = useState(() => new Date());
  const tick = useCallback(() => setNow(new Date()), []);
  useEffect(() => {
    const timer = setInterval(tick, RECHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    const doc = typeof document === "undefined" ? undefined : document;
    doc?.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      doc?.removeEventListener("visibilitychange", onVisible);
    };
  }, [tick]);
  return [now, tick];
}

/**
 * The active profile's backup reminder: whether it is due, and `snooze` to put
 * it off for another interval.
 */
export function useBackupReminder() {
  const { active } = useStore();
  const entry = active?.entry ?? null;
  const [snoozedAt, setSnoozedAt] = usePreference<string | null>(
    backupReminderSnoozedKey(entry?.profileId ?? ""),
    null,
  );

  const [now, refreshNow] = useNow();

  const due = entry !== null && isBackupReminderDue(entry, snoozedAt, now);
  // `now` moves along too: a snooze later than it would count as "in the future".
  const snooze = useCallback(() => {
    setSnoozedAt(new Date().toISOString());
    refreshNow();
  }, [setSnoozedAt, refreshNow]);

  return { due, lastExportAt: entry?.lastExportAt ?? null, snooze };
}
