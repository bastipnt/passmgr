import { type DecryptedRecord, type RecordType, tagKey } from "@repo/schema";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { usePreference } from "../hooks/use-preference";
import { useGetRecords } from "../hooks/use-records";
import { useTags } from "../hooks/use-tags";
import { useVaults } from "../hooks/use-vaults";
import { PREF_KEYS } from "../preferences/preference-keys";
import { RECORD_TYPE_LABELS } from "../records/record-field-specs";
import { getRecordSubtitle } from "../records/record-summary";
import { filterByTag, type TagCount, type TagFilter } from "../records/tags";
import type { VaultFilter, VaultInfo } from "../vaults/vault-info";

export type SortOption = "most-recent" | "alphabetical" | "newest" | "oldest";
export type RecordGroup = { label: string | null; records: DecryptedRecord[] };
/** Which records the list shows: every type, or one. */
export type TypeFilter = RecordType | "all";

export const DEFAULT_SORT: SortOption = "most-recent";

export const SORT_LABELS: Record<SortOption, string> = {
  "most-recent": "Most recent",
  alphabetical: "Alphabetical",
  newest: "Newest to oldest",
  oldest: "Oldest to newest",
};

/**
 * Records are versioned and `created_at` belongs to the latest version, so it
 * moves on every edit. `firstCreatedAt` is the first version's timestamp.
 */
function createdAt(record: DecryptedRecord): string | null {
  return record.firstCreatedAt ?? record.created_at;
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

/** The label of the starred records' group, atop the list in every sort. */
export const FAVORITES_LABEL = "Favorites";

/**
 * The list's groups: the starred records first (in the list's order), then
 * the rest by `sort`. With favorites above it, the non-letter group of an
 * A–Z list gets a "#" label, else its rows would read as favorites.
 */
function groupRecords(sortedRecords: DecryptedRecord[], sort: SortOption): RecordGroup[] {
  const favorites = sortedRecords.filter((record) => record.favorite);
  if (favorites.length === 0) return groupBySort(sortedRecords, sort);
  const rest = groupBySort(
    sortedRecords.filter((record) => !record.favorite),
    sort,
  ).map((group) => (group.label === null ? { ...group, label: "#" } : group));
  return [{ label: FAVORITES_LABEL, records: favorites }, ...rest];
}

function groupBySort(sortedRecords: DecryptedRecord[], sort: SortOption): RecordGroup[] {
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

  const bucketMap = new Map<string, DecryptedRecord[]>();

  for (const record of sortedRecords) {
    const bucket = getDateBucket(
      sort === "most-recent" ? record.clientUpdatedAt : createdAt(record),
    );
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
        cmp = compareTimestamps(createdAt(b), createdAt(a));
        break;
      case "oldest":
        cmp = compareTimestamps(createdAt(a), createdAt(b));
        break;
    }

    if (cmp !== 0) return cmp;

    // Tiebreakers: created_at → clientUpdatedAt → alphabetical
    cmp = compareTimestamps(createdAt(a), createdAt(b));
    if (cmp !== 0) return cmp;

    cmp = new Date(a.clientUpdatedAt).getTime() - new Date(b.clientUpdatedAt).getTime();
    if (cmp !== 0) return cmp;

    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

/** The records of one type, or all of them. */
export function filterByType(records: DecryptedRecord[], type: TypeFilter): DecryptedRecord[] {
  return type === "all" ? records : records.filter((record) => record.type === type);
}

/** The records of one vault, or of all of them. */
export function filterByVault(records: DecryptedRecord[], vault: VaultFilter): DecryptedRecord[] {
  return vault === "all" ? records : records.filter((record) => record.vaultId === vault);
}

/** The stored vault filter, while it names a vault of this profile; else every vault. */
function useVaultFilter(): [VaultFilter, (vault: VaultFilter) => void] {
  const { getVault } = useVaults();
  const [stored, setStored] = usePreference<VaultFilter>(PREF_KEYS.vaultFilter, "all");
  // Another profile's vault, or one deleted meanwhile.
  return [stored !== "all" && getVault(stored) ? stored : "all", setStored];
}

/**
 * The tag filter, while a record of the vault in view carries the tag. Once
 * none does (renamed, removed, another vault picked) it's dropped, so it
 * doesn't come back by itself later.
 */
function useTagFilter(tags: TagCount[]): [TagFilter, (tag: TagFilter) => void] {
  const [stored, setStored] = useState<TagFilter>(null);
  const key = stored === null ? null : tagKey(stored);
  const shown = key === null ? undefined : tags.find(({ tag }) => tagKey(tag) === key);
  if (stored !== null && !shown) setStored(null);
  return [shown?.tag ?? null, setStored];
}

/** Title matches first, then subtitle matches, then tag matches. */
export function filterBySearch(records: DecryptedRecord[], query: string): DecryptedRecord[] {
  if (!query.trim()) return records;
  const q = query.toLowerCase().trim();
  const titleMatches: DecryptedRecord[] = [];
  const subtitleMatches: DecryptedRecord[] = [];
  const tagMatches: DecryptedRecord[] = [];
  for (const record of records) {
    if (record.title.toLowerCase().includes(q)) titleMatches.push(record);
    else if (getRecordSubtitle(record)?.toLowerCase().includes(q)) subtitleMatches.push(record);
    else if (record.tags?.some((tag) => tag.toLowerCase().includes(q))) tagMatches.push(record);
  }
  return [...titleMatches, ...subtitleMatches, ...tagMatches];
}

type ListFilters = { type?: TypeFilter; vault?: VaultFilter; tag?: TagFilter };

function filterRecords(
  records: DecryptedRecord[],
  { type = "all", vault = "all", tag = null }: ListFilters,
): DecryptedRecord[] {
  return filterByTag(filterByType(filterByVault(records, vault), type), tag);
}

/**
 * The list's title: what it shows. A search covers every type, vault and tag.
 * Otherwise the vault in view, the type and the tag it's narrowed to.
 */
export function listTitle({
  typeFilter,
  tagFilter,
  searching,
  vault,
}: {
  typeFilter: TypeFilter;
  tagFilter: TagFilter;
  searching: boolean;
  vault?: VaultInfo;
}): string {
  if (searching) return "Results";
  const parts = [
    vault?.name,
    typeFilter === "all" ? undefined : RECORD_TYPE_LABELS[typeFilter].plural,
    tagFilter === null ? undefined : `#${tagFilter}`,
  ].filter((part) => part !== undefined);
  return parts.length > 0 ? parts.join(" · ") : "All items";
}

type SortedRecordsContextValue = {
  query: string;
  setQuery: (query: string) => void;
  sort: SortOption;
  handleSortChange: (value: string) => void;
  /** The list's type filter. A search ignores it and looks through every record. */
  typeFilter: TypeFilter;
  setTypeFilter: (type: TypeFilter) => void;
  /** The list's vault filter ("All vaults" or one). A search ignores it too. */
  vaultFilter: VaultFilter;
  setVaultFilter: (vault: VaultFilter) => void;
  /** The list's tag filter, for this session only. A search ignores it too. */
  tagFilter: TagFilter;
  setTagFilter: (tag: TagFilter) => void;
  /** The tags of the vault in view (of every vault for "All vaults"), to filter by. */
  tags: TagCount[];
  /** Every record carrying `tag`: the other filters and the search cleared. */
  showTag: (tag: string) => void;
  /** The listed records in the order shown (favorites first). */
  sortedRecords: DecryptedRecord[];
  recordGroups: RecordGroup[];
  /** Whether any group carries a label (none do while searching). */
  hasGroupLabels: boolean;
};

const SortedRecordsContext = createContext<SortedRecordsContextValue | null>(null);

export function useSortedRecords(): SortedRecordsContextValue {
  const ctx = useContext(SortedRecordsContext);
  if (!ctx) throw new Error("useSortedRecords must be used within SortedRecordsProvider");
  return ctx;
}

/**
 * Search over all records without touching the provider's own `query`. Mobile
 * has a dedicated search tab whose input must not filter the records tab, so it
 * keeps its query in local state and groups the results through this hook.
 * An empty query falls back to the regular sorted grouping of the records
 * `filters` let through (the records tab passes the list's); a search looks
 * through every record, as the provider's does.
 */
export function useRecordSearch(query: string, filters: ListFilters = {}): RecordGroup[] {
  const { records } = useGetRecords();
  const { sort } = useSortedRecords();
  const trimmed = query.trim();
  const { type, vault, tag } = filters;

  return useMemo(() => {
    if (!trimmed)
      return groupRecords(sortRecords(filterRecords(records, { type, vault, tag }), sort), sort);
    return [{ label: null, records: filterBySearch(records, trimmed) }];
  }, [records, sort, trimmed, type, vault, tag]);
}

type SortedRecordsProviderProps = {
  children: ReactNode;
};

export function SortedRecordsProvider({ children }: SortedRecordsProviderProps) {
  const { records } = useGetRecords();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [vaultFilter, setVaultFilter] = useVaultFilter();
  const tags = useTags(vaultFilter);
  const [tagFilter, setTagFilter] = useTagFilter(tags);
  const [storedSort, setStoredSort] = usePreference<SortOption>(PREF_KEYS.sort, DEFAULT_SORT);
  // localStorage is user-editable and older builds wrote unvalidated values.
  const sort = storedSort in SORT_LABELS ? storedSort : DEFAULT_SORT;

  const hasQuery = query.trim().length > 0;
  // A search looks through every record: the filter narrows browsing, and a
  // match hidden by it would read as "not in the vault".
  const filtered = useMemo(
    () =>
      hasQuery
        ? filterBySearch(records, query)
        : filterRecords(records, { type: typeFilter, vault: vaultFilter, tag: tagFilter }),
    [records, query, hasQuery, typeFilter, vaultFilter, tagFilter],
  );
  const recordGroups = useMemo(
    () =>
      hasQuery
        ? [{ label: null, records: filtered }]
        : groupRecords(sortRecords(filtered, sort), sort),
    [filtered, sort, hasQuery],
  );
  // In the order shown: favorites first, so arrow keys walk the list as it reads.
  const sortedRecords = useMemo(
    () => recordGroups.flatMap((recordGroup) => recordGroup.records),
    [recordGroups],
  );

  const hasGroupLabels = recordGroups.some((recordGroup) => recordGroup.label);

  // The vault and type filters may hide every record with the tag (its record
  // was opened from a search), which would drop the tag filter right away.
  const showTag = useCallback(
    (tag: string) => {
      setQuery("");
      setTypeFilter("all");
      setVaultFilter("all");
      setTagFilter(tag);
    },
    [setVaultFilter, setTagFilter],
  );

  function handleSortChange(value: string) {
    setStoredSort(value as SortOption);
  }

  const value = useMemo(
    () => ({
      query,
      setQuery,
      sort,
      handleSortChange,
      typeFilter,
      setTypeFilter,
      vaultFilter,
      setVaultFilter,
      tagFilter,
      setTagFilter,
      tags,
      showTag,
      sortedRecords,
      recordGroups,
      hasGroupLabels,
    }),
    [
      query,
      sort,
      typeFilter,
      vaultFilter,
      setVaultFilter,
      tagFilter,
      setTagFilter,
      tags,
      showTag,
      sortedRecords,
      recordGroups,
      hasGroupLabels,
    ],
  );

  return <SortedRecordsContext value={value}>{children}</SortedRecordsContext>;
}
