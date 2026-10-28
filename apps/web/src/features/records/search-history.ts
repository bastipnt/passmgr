import type { CategoryFilter } from "@repo/client/src/providers/SortedRecordsProvider";

/** Kept in the history entry the phone search pushes, so Back from a record lands on it again. */
export type SearchEntry = {
  tagsBefore: string[];
  categoryBefore: CategoryFilter;
  scrollY: number;
};

function historyState(): Record<string, unknown> | undefined {
  const state: unknown = history.state;
  return typeof state === "object" && state !== null
    ? (state as Record<string, unknown>)
    : undefined;
}

export function currentSearchEntry(): SearchEntry | undefined {
  const entry = historyState()?.mobileSearch;
  if (typeof entry !== "object" || entry === null) return undefined;
  // Entries pushed by an older build lack the newer fields.
  return { tagsBefore: [], categoryBefore: "all", scrollY: 0, ...entry };
}

export function pushSearchEntry(entry: SearchEntry): void {
  history.pushState({ mobileSearch: entry }, "");
}

// In memory: written into the search's history entry it would cost a location change on the tap that opens a record.
let resultsScrollY = 0;

export function saveResultsScroll(y: number): void {
  resultsScrollY = y;
}

export function takeResultsScroll(): number {
  const y = resultsScrollY;
  resultsScrollY = 0;
  return y;
}

export const OPENED_FROM_SEARCH = { fromSearch: true };

/** Whether the record page in view was opened from the search, which Back returns to. */
export function openedFromSearch(): boolean {
  return historyState()?.fromSearch === true;
}

/**
 * The state for an entry pushed over the search, or replacing one opened from
 * it (a moved record, the record a create sheet saved), so Back from it still
 * returns to the search with the keyboard.
 */
export function searchReturnState(): typeof OPENED_FROM_SEARCH | undefined {
  return currentSearchEntry() || openedFromSearch() ? OPENED_FROM_SEARCH : undefined;
}
