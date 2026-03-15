import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { DecryptedItem } from "@repo/schema";
import { useGetItems } from "../hooks/get-items";

export type SortOption = "most-recent" | "alphabetical" | "newest" | "oldest";
export type ItemGroup = { label: string | null; items: DecryptedItem[] };

// TODO: created_at does not correctly work here, because the items are versioned and it always takes the created_at of the newest version
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

function groupItems(sortedItems: DecryptedItem[], sort: SortOption): ItemGroup[] {
  if (sort === "alphabetical") {
    const letterMap = new Map<string | null, DecryptedItem[]>();

    for (const item of sortedItems) {
      const first = item.title.charAt(0).toUpperCase();
      const key = /^[A-Z]$/.test(first) ? first : null;
      const list = letterMap.get(key);
      if (list) list.push(item);
      else letterMap.set(key, [item]);
    }

    const groups: ItemGroup[] = [];
    // Non-letter group first (no label)
    const misc = letterMap.get(null);
    if (misc) groups.push({ label: null, items: misc });
    // Letter groups in alphabetical order
    for (const [key, items] of letterMap) {
      if (key !== null) groups.push({ label: key, items });
    }
    return groups;
  }

  const tsKey = sort === "most-recent" ? "clientUpdatedAt" : "created_at";
  const bucketMap = new Map<string, DecryptedItem[]>();

  for (const item of sortedItems) {
    const bucket = getDateBucket(item[tsKey]);
    const list = bucketMap.get(bucket);
    if (list) list.push(item);
    else bucketMap.set(bucket, [item]);
  }

  const order = sort === "oldest" ? [...BUCKET_ORDER].reverse() : BUCKET_ORDER;

  return order
    .filter((b) => bucketMap.has(b))
    .map((b) => ({
      label: b,
      items: bucketMap.get(b)!,
    }));
}

function sortItems(items: DecryptedItem[], sort: SortOption): DecryptedItem[] {
  return [...items].sort((a, b) => {
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

function filterBySearch(items: DecryptedItem[], query: string): DecryptedItem[] {
  if (!query.trim()) return items;
  const q = query.toLowerCase().trim();
  const titleMatches: DecryptedItem[] = [];
  const usernameMatches: DecryptedItem[] = [];
  for (const item of items) {
    if (item.title.toLowerCase().includes(q)) titleMatches.push(item);
    else if (item.username?.toLowerCase().includes(q)) usernameMatches.push(item);
  }
  return [...titleMatches, ...usernameMatches];
}

type SortedItemsContextValue = {
  query: string;
  setQuery: (query: string) => void;
  sort: SortOption;
  handleSortChange: (value: string) => void;
  sortedItems: DecryptedItem[];
  groups: ItemGroup[];
};

const SortedItemsContext = createContext<SortedItemsContextValue | null>(null);

export function useSortedItems(): SortedItemsContextValue {
  const ctx = useContext(SortedItemsContext);
  if (!ctx) throw new Error("useSortedItems must be used within SortedItemsProvider");
  return ctx;
}

type SortedItemsProviderProps = {
  children: ReactNode;
};

export function SortedItemsProvider({ children }: SortedItemsProviderProps) {
  const { items } = useGetItems();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>(getInitialSort);

  const hasQuery = query.trim().length > 0;
  const filtered = useMemo(() => filterBySearch(items, query), [items, query]);
  const sortedItems = useMemo(
    () => (hasQuery ? filtered : sortItems(filtered, sort)),
    [filtered, sort, hasQuery],
  );
  const groups = useMemo(
    () => (hasQuery ? [{ label: null, items: sortedItems }] : groupItems(sortedItems, sort)),
    [sortedItems, sort, hasQuery],
  );

  function handleSortChange(value: string) {
    const next = value as SortOption;
    setSort(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  const value = useMemo(
    () => ({ query, setQuery, sort, handleSortChange, sortedItems, groups }),
    [query, sort, sortedItems, groups],
  );

  return <SortedItemsContext value={value}>{children}</SortedItemsContext>;
}
