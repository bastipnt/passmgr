import { useMemo, useState } from "react";
import type { DecryptedItem } from "@repo/schema";

export type SortOption = "most-recent" | "alphabetical" | "newest" | "oldest";

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

export function useSortedItems(items: DecryptedItem[]) {
  const [sort, setSort] = useState<SortOption>(getInitialSort);

  const sortedItems = useMemo(() => sortItems(items, sort), [items, sort]);

  function handleSortChange(value: string) {
    const next = value as SortOption;
    setSort(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return { sort, sortedItems, handleSortChange };
}
