import { useGetRecords, usePreferences } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { useCallback, useMemo, useState } from "react";

const STORAGE_KEY = "search.recent-records";
const MAX_ENTRIES = 8;

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string").slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/**
 * Records the user opened from search, persisted on-device only (MMKV via
 * `PreferencesStore`). Only record ids are stored — never the search terms.
 * Most recent first, capped at `MAX_ENTRIES`; ids that no longer resolve to a
 * record (deleted since) are skipped.
 */
export function useRecentRecords() {
  const preferences = usePreferences();
  const { records } = useGetRecords();
  const [recentIds, setRecentIds] = useState<string[]>(() => parse(preferences.get(STORAGE_KEY)));

  const recentRecords = useMemo<DecryptedRecord[]>(() => {
    const byId = new Map(records.map((record) => [record.recordId, record]));
    return recentIds
      .map((id) => byId.get(id))
      .filter((record): record is DecryptedRecord => record !== undefined);
  }, [recentIds, records]);

  const persist = useCallback(
    (next: string[]) => {
      setRecentIds(next);
      if (next.length === 0) preferences.remove(STORAGE_KEY);
      else preferences.set(STORAGE_KEY, JSON.stringify(next));
    },
    [preferences],
  );

  const addRecentRecord = useCallback(
    (recordId: string) => {
      setRecentIds((current) => {
        const next = [recordId, ...current.filter((id) => id !== recordId)].slice(0, MAX_ENTRIES);
        preferences.set(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [preferences],
  );

  const clearRecentRecords = useCallback(() => persist([]), [persist]);

  return { recentRecords, addRecentRecord, clearRecentRecords };
}
