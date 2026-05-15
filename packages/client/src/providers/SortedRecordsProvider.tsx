import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { DecryptedRecord } from "@repo/schema";
import { useGetRecords } from "../hooks/use-records";

export type SortOption = "most-recent" | "alphabetical" | "newest" | "oldest";
export type RecordGroup = { label: string | null; records: DecryptedRecord[] };

// TODO: created_at does not correctly work here, because the records are versioned and it always takes the created_at of the newest version
export const SORT_LABELS: Record<SortOption, string> = {
  "most-recent": "Most recent",
  alphabetical: "Alphabetical",
  newest: "Newest to oldest",
  oldest: "Oldest to newest",
};

const STORAGE_KEY = "pass-mgr-sort";

function getInitialSort(): SortOption {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored in SORT_LABELS) return stored as SortOption;
  return "most-recent";
}

function compareTimestamps(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1; // nulls last
  if (!b) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

const BUCKET_ORDER = [
  "Today",
  "Yesterday",
  "This week",
  "Last week",
  "This month",
  "Last month",
  "Older",
] as const;

function getMonday(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  // getDay(): 0=Sun, adjust so Mon=0
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

function getDateBucket(ts: string | null): (typeof BUCKET_ORDER)[number] {
  if (!ts) return "Older";
  const now = new Date();
  const then = new Date(ts);

  // Today
  if (
    now.getFullYear() === then.getFullYear() &&
    now.getMonth() === then.getMonth() &&
    now.getDate() === then.getDate()
  )
    return "Today";

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    yesterday.getFullYear() === then.getFullYear() &&
    yesterday.getMonth() === then.getMonth() &&
    yesterday.getDate() === then.getDate()
  )
    return "Yesterday";

  const thenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const mondayThisWeek = getMonday(now);
  const mondayLastWeek = new Date(mondayThisWeek);
  mondayLastWeek.setDate(mondayLastWeek.getDate() - 7);

  if (thenDay >= mondayThisWeek) return "This week";
  if (thenDay >= mondayLastWeek) return "Last week";

  // This month
  if (now.getFullYear() === then.getFullYear() && now.getMonth() === then.getMonth())
    return "This month";

  // Last month
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  if (lastMonth.getFullYear() === then.getFullYear() && lastMonth.getMonth() === then.getMonth())
    return "Last month";

  return "Older";
}

function groupRecords(sortedRecords: DecryptedRecord[], sort: SortOption): RecordGroup[] {
  if (sort === "alphabetical") {
    const letterMap = new Map<string | null, DecryptedRecord[]>();

    for (const record of sortedRecords) {
      const first = record.title.charAt(0).toUpperCase();
      const key = /^[A-Z]$/.test(first) ? first : null;
      const list = letterMap.get(key);
      if (list) list.push(record);
      else letterMap.set(key, [record]);
    }

    const groups: RecordGroup[] = [];
    // Non-letter group first (no label)
    const misc = letterMap.get(null);
    if (misc) groups.push({ label: null, records: misc });
    // Letter groups in alphabetical order
    for (const [key, records] of letterMap) {
      if (key !== null) groups.push({ label: key, records });
    }
    return groups;
  }

  const tsKey = sort === "most-recent" ? "clientUpdatedAt" : "created_at";
  const bucketMap = new Map<string, DecryptedRecord[]>();

  for (const record of sortedRecords) {
    const bucket = getDateBucket(record[tsKey]);
    const list = bucketMap.get(bucket);
    if (list) list.push(record);
    else bucketMap.set(bucket, [record]);
  }

  const order = sort === "oldest" ? [...BUCKET_ORDER].reverse() : BUCKET_ORDER;

  return order
    .filter((b) => bucketMap.has(b))
    .map((b) => ({
      label: b,
      records: bucketMap.get(b)!,
    }));
}

function sortRecords(records: DecryptedRecord[], sort: SortOption): DecryptedRecord[] {
  return [...records].sort((a, b) => {
    let cmp: number;

    switch (sort) {
      case "most-recent":
        cmp = new Date(b.clientUpdatedAt).getTime() - new Date(a.clientUpdatedAt).getTime();
        break;
      case "alphabetical":
        cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        break;
      case "newest":
        cmp = compareTimestamps(b.created_at, a.created_at);
        break;
      case "oldest":
        cmp = compareTimestamps(a.created_at, b.created_at);
        break;
    }

    if (cmp !== 0) return cmp;

    // Tiebreakers: created_at → clientUpdatedAt → alphabetical
    cmp = compareTimestamps(a.created_at, b.created_at);
    if (cmp !== 0) return cmp;

    cmp = new Date(a.clientUpdatedAt).getTime() - new Date(b.clientUpdatedAt).getTime();
    if (cmp !== 0) return cmp;

    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

function filterBySearch(records: DecryptedRecord[], query: string): DecryptedRecord[] {
  if (!query.trim()) return records;
  const q = query.toLowerCase().trim();
  const titleMatches: DecryptedRecord[] = [];
  const usernameMatches: DecryptedRecord[] = [];
  for (const record of records) {
    if (record.title.toLowerCase().includes(q)) titleMatches.push(record);
    else if (record.username?.toLowerCase().includes(q)) usernameMatches.push(record);
  }
  return [...titleMatches, ...usernameMatches];
}

type SortedRecordsContextValue = {
  query: string;
  setQuery: (query: string) => void;
  sort: SortOption;
  handleSortChange: (value: string) => void;
  sortedRecords: DecryptedRecord[];
  groups: RecordGroup[];
};

const SortedRecordsContext = createContext<SortedRecordsContextValue | null>(null);

export function useSortedRecords(): SortedRecordsContextValue {
  const ctx = useContext(SortedRecordsContext);
  if (!ctx) throw new Error("useSortedRecords must be used within SortedRecordsProvider");
  return ctx;
}

type SortedRecordsProviderProps = {
  children: ReactNode;
};

export function SortedRecordsProvider({ children }: SortedRecordsProviderProps) {
  const { records } = useGetRecords();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>(getInitialSort);

  const hasQuery = query.trim().length > 0;
  const filtered = useMemo(() => filterBySearch(records, query), [records, query]);
  const sortedRecords = useMemo(
    () => (hasQuery ? filtered : sortRecords(filtered, sort)),
    [filtered, sort, hasQuery],
  );
  const groups = useMemo(
    () => (hasQuery ? [{ label: null, records: sortedRecords }] : groupRecords(sortedRecords, sort)),
    [sortedRecords, sort, hasQuery],
  );

  function handleSortChange(value: string) {
    const next = value as SortOption;
    setSort(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  const value = useMemo(
    () => ({ query, setQuery, sort, handleSortChange, sortedRecords, groups }),
    [query, sort, sortedRecords, groups],
  );

  return <SortedRecordsContext value={value}>{children}</SortedRecordsContext>;
}
