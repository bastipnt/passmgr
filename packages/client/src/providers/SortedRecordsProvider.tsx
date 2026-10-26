import { type DecryptedRecord, RECORD_TYPES, type RecordType, tagKey } from "@repo/schema";
import { counted } from "@repo/util";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePreference } from "../hooks/use-preference";
import { useGetRecords } from "../hooks/use-records";
import { useTags } from "../hooks/use-tags";
import { useVaults } from "../hooks/use-vaults";
import { PREF_KEYS } from "../preferences/preference-keys";
import { RECORD_TYPE_LABELS } from "../records/record-field-specs";
import { getRecordSubtitle } from "../records/record-summary";
import { collectTags, filterByTags, type TagCount } from "../records/tags";
import type { VaultFilter, VaultInfo } from "../vaults/vault-info";

export type SortOption = "most-recent" | "alphabetical" | "newest" | "oldest";
export type RecordGroup = { label: string | null; records: DecryptedRecord[] };
/** Which records the list shows: every one, the starred ones (of any type), or one type. */
export type CategoryFilter = RecordType | "all" | "favorites";

export const CATEGORIES: readonly CategoryFilter[] = ["all", "favorites", ...RECORD_TYPES];

export function categoryLabel(category: CategoryFilter): string {
  if (category === "all") return "All items";
  if (category === "favorites") return FAVORITES_LABEL;
  return RECORD_TYPE_LABELS[category].plural;
}

export function categoryShortLabel(category: CategoryFilter): string {
  if (category === "all" || category === "favorites") return categoryLabel(category);
  return RECORD_TYPE_LABELS[category].short ?? categoryLabel(category);
}

export function categoryCountLabel(category: CategoryFilter, count: number): string {
  if (category === "all") return counted(count, "item", "items");
  if (category === "favorites") return counted(count, "favorite", "favorites");
  const { noun, nouns } = RECORD_TYPE_LABELS[category];
  return counted(count, noun, nouns);
}

/** What an empty list says when a category or tags narrow it. */
export function emptyCategoryHint(
  category: CategoryFilter,
  tags: readonly string[] = [],
): string | undefined {
  if (tags.length > 0) return "Nothing here carries these tags.";
  if (category === "all") return undefined;
  if (category === "favorites") return "No favorites yet.";
  return `No ${RECORD_TYPE_LABELS[category].nouns} yet.`;
}

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
function groupRecords(
  sortedRecords: DecryptedRecord[],
  sort: SortOption,
  category: CategoryFilter = "all",
): RecordGroup[] {
  // Every record here is starred: a favorites group would repeat the whole list.
  if (category === "favorites") return groupBySort(sortedRecords, sort);
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

export function filterByCategory(
  records: DecryptedRecord[],
  category: CategoryFilter,
): DecryptedRecord[] {
  if (category === "all") return records;
  if (category === "favorites") return records.filter((record) => record.favorite);
  return records.filter((record) => record.type === category);
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
 * The selected tags, in the order picked, each while a record of the vault in
 * view carries it. Once none does (renamed, removed, another vault picked) it's
 * dropped, so it doesn't come back by itself later.
 */
function useTagFilters(
  vaultTags: TagCount[],
): [string[], (update: (tags: string[]) => string[]) => void] {
  const [stored, setStored] = useState<string[]>([]);
  const shown = useMemo(
    () =>
      stored.flatMap((selected) => {
        const key = tagKey(selected);
        const match = vaultTags.find(({ tag }) => tagKey(tag) === key);
        return match ? [match.tag] : [];
      }),
    [stored, vaultTags],
  );
  if (shown.length !== stored.length) setStored(shown);
  return [shown, setStored];
}

/** A query starting with this matches tags only. */
export const TAG_SEARCH_PREFIX = "#";

/** Title matches first, then subtitle matches, then tag matches. */
export function filterBySearch(records: DecryptedRecord[], query: string): DecryptedRecord[] {
  if (!query.trim()) return records;
  const q = query.toLowerCase().trim();
  if (q.startsWith(TAG_SEARCH_PREFIX)) {
    const tagQuery = q.slice(TAG_SEARCH_PREFIX.length).trim();
    return records.filter((record) =>
      record.tags?.some((tag) => tag.toLowerCase().includes(tagQuery)),
    );
  }
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

type ListFilters = { category?: CategoryFilter; vault?: VaultFilter; tags?: readonly string[] };

const NO_TAGS: readonly string[] = [];

function filterRecords(
  records: DecryptedRecord[],
  { category = "all", vault = "all", tags = NO_TAGS }: ListFilters,
): DecryptedRecord[] {
  return filterByCategory(filterByTags(filterByVault(records, vault), tags), category);
}

/** The list heading where the vault and the tags show elsewhere (web: vault switcher, filter chips). */
export function listHeading(categoryFilter: CategoryFilter, searching: boolean): string {
  return searching ? "Results" : categoryLabel(categoryFilter);
}

/** The category (unless "All items") and each tag narrowing the list. */
export function activeFilterCount(
  categoryFilter: CategoryFilter,
  tagFilters: readonly string[],
): number {
  return (categoryFilter === "all" ? 0 : 1) + tagFilters.length;
}

/**
 * The list's title: what it shows. A search covers the whole vault in view.
 * Otherwise the vault in view, the category and the tags it's narrowed to.
 */
export function listTitle({
  categoryFilter,
  tagFilters,
  searching,
  vault,
}: {
  categoryFilter: CategoryFilter;
  tagFilters: readonly string[];
  searching: boolean;
  vault?: VaultInfo;
}): string {
  if (searching) return "Results";
  const parts = [
    vault?.name,
    categoryFilter === "all" ? undefined : categoryLabel(categoryFilter),
    tagFilters.length === 0 ? undefined : tagFilters.map((tag) => `#${tag}`).join(" "),
  ].filter((part) => part !== undefined);
  return parts.length > 0 ? parts.join(" · ") : "All items";
}

type SortedRecordsContextValue = {
  query: string;
  setQuery: (query: string) => void;
  sort: SortOption;
  handleSortChange: (value: string) => void;
  /** The list's category. A search ignores it and looks through the whole vault in view. */
  categoryFilter: CategoryFilter;
  setCategoryFilter: (category: CategoryFilter) => void;
  /** How many records each category holds, in the vault and tags in view. */
  categoryCounts: Record<CategoryFilter, number>;
  /** The list's vault filter ("All vaults" or one). A search keeps to it. */
  vaultFilter: VaultFilter;
  /** Picks the vault in view and shows all of it again (category "all"). */
  setVaultFilter: (vault: VaultFilter) => void;
  /**
   * The selected tags, in the order picked, for this session only; a record
   * must carry every one. A search ignores them.
   */
  tagFilters: string[];
  toggleTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  clearTags: () => void;
  /** Back to the whole vault in view: category "all", no tags. */
  clearFilters: () => void;
  /** The list's search field, so others can focus it. */
  searchInputRef: RefObject<{ focus: () => void } | null>;
  /** Focuses the search with the tag prefix typed. */
  searchTags: () => void;
  /**
   * The tags of the vault in view (of every vault for "All vaults"), the
   * selected ones first, then A–Z. `count`: the records left with the tag
   * added to the category and tags in view (0 for a tag that would empty it).
   */
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
 * `filters` let through (the records tab passes the list's); a search keeps to
 * `filters.vault` only, as the provider's does.
 */
export function useRecordSearch(query: string, filters: ListFilters = {}): RecordGroup[] {
  const { records } = useGetRecords();
  const { sort } = useSortedRecords();
  const trimmed = query.trim();
  const { category, vault, tags } = filters;

  return useMemo(() => {
    if (!trimmed)
      return groupRecords(
        sortRecords(filterRecords(records, { category, vault, tags }), sort),
        sort,
        category,
      );
    return [
      { label: null, records: filterBySearch(filterByVault(records, vault ?? "all"), trimmed) },
    ];
  }, [records, sort, trimmed, category, vault, tags]);
}

function countCategories(records: DecryptedRecord[]): Record<CategoryFilter, number> {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<
    CategoryFilter,
    number
  >;
  for (const record of records) {
    counts.all += 1;
    if (record.type in counts) counts[record.type] += 1;
    if (record.favorite) counts.favorites += 1;
  }
  return counts;
}

function tagCounts(
  vaultTags: TagCount[],
  selected: readonly string[],
  inView: DecryptedRecord[],
): TagCount[] {
  const counts = new Map(collectTags(inView).map(({ tag, count }) => [tagKey(tag), count]));
  const withCount = ({ tag }: TagCount) => ({ tag, count: counts.get(tagKey(tag)) ?? 0 });
  const selectedKeys = selected.map(tagKey);
  return [
    ...selected.map((tag) => withCount({ tag, count: 0 })),
    ...vaultTags.filter(({ tag }) => !selectedKeys.includes(tagKey(tag))).map(withCount),
  ];
}

type SortedRecordsProviderProps = {
  children: ReactNode;
};

export function SortedRecordsProvider({ children }: SortedRecordsProviderProps) {
  const { records } = useGetRecords();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [vaultFilter, setStoredVaultFilter] = useVaultFilter();
  const vaultTags = useTags(vaultFilter);
  const [tagFilters, setTagFilters] = useTagFilters(vaultTags);
  const [storedSort, setStoredSort] = usePreference<SortOption>(PREF_KEYS.sort, DEFAULT_SORT);
  // localStorage is user-editable and older builds wrote unvalidated values.
  const sort = storedSort in SORT_LABELS ? storedSort : DEFAULT_SORT;

  const hasQuery = query.trim().length > 0;
  const vaultRecords = useMemo(() => filterByVault(records, vaultFilter), [records, vaultFilter]);
  const taggedRecords = useMemo(
    () => filterByTags(vaultRecords, tagFilters),
    [vaultRecords, tagFilters],
  );
  const browsed = useMemo(
    () => filterByCategory(taggedRecords, categoryFilter),
    [taggedRecords, categoryFilter],
  );
  const categoryCounts = useMemo(() => countCategories(taggedRecords), [taggedRecords]);
  const tags = useMemo(
    () => tagCounts(vaultTags, tagFilters, browsed),
    [vaultTags, tagFilters, browsed],
  );

  // A search keeps to the vault in view (the scope the user picked) but not to
  // the category or tags: those narrow browsing, and a match hidden by them
  // would read as "not in the vault".
  const recordGroups = useMemo(
    () =>
      hasQuery
        ? [{ label: null, records: filterBySearch(vaultRecords, query) }]
        : groupRecords(sortRecords(browsed, sort), sort, categoryFilter),
    [vaultRecords, browsed, query, hasQuery, sort, categoryFilter],
  );
  // In the order shown: favorites first, so arrow keys walk the list as it reads.
  const sortedRecords = useMemo(
    () => recordGroups.flatMap((recordGroup) => recordGroup.records),
    [recordGroups],
  );

  const hasGroupLabels = recordGroups.some((recordGroup) => recordGroup.label);

  const setVaultFilter = useCallback(
    (vault: VaultFilter) => {
      setStoredVaultFilter(vault);
      setCategoryFilter("all");
    },
    [setStoredVaultFilter],
  );

  const toggleTag = useCallback(
    (tag: string) =>
      setTagFilters((selected) =>
        selected.some((own) => tagKey(own) === tagKey(tag))
          ? selected.filter((own) => tagKey(own) !== tagKey(tag))
          : [...selected, tag],
      ),
    [setTagFilters],
  );
  const removeTag = useCallback(
    (tag: string) =>
      setTagFilters((selected) => selected.filter((own) => tagKey(own) !== tagKey(tag))),
    [setTagFilters],
  );
  const clearTags = useCallback(() => setTagFilters(() => []), [setTagFilters]);
  const clearFilters = useCallback(() => {
    setCategoryFilter("all");
    clearTags();
  }, [clearTags]);

  const searchInputRef = useRef<{ focus: () => void } | null>(null);
  const searchTags = useCallback(() => {
    setQuery(TAG_SEARCH_PREFIX);
    searchInputRef.current?.focus();
  }, []);

  // The vault and category may hide every record with the tag (its record was
  // opened from a search), which would drop the tag right away.
  const showTag = useCallback(
    (tag: string) => {
      setQuery("");
      setVaultFilter("all");
      setTagFilters(() => [tag]);
    },
    [setVaultFilter, setTagFilters],
  );

  const handleSortChange = useCallback(
    (value: string) => setStoredSort(value as SortOption),
    [setStoredSort],
  );

  const value = useMemo(
    () => ({
      query,
      setQuery,
      sort,
      handleSortChange,
      categoryFilter,
      setCategoryFilter,
      categoryCounts,
      vaultFilter,
      setVaultFilter,
      tagFilters,
      toggleTag,
      removeTag,
      clearTags,
      clearFilters,
      searchInputRef,
      searchTags,
      tags,
      showTag,
      sortedRecords,
      recordGroups,
      hasGroupLabels,
    }),
    [
      query,
      sort,
      handleSortChange,
      categoryFilter,
      categoryCounts,
      vaultFilter,
      setVaultFilter,
      tagFilters,
      toggleTag,
      removeTag,
      clearTags,
      clearFilters,
      searchTags,
      tags,
      showTag,
      sortedRecords,
      recordGroups,
      hasGroupLabels,
    ],
  );

  return <SortedRecordsContext value={value}>{children}</SortedRecordsContext>;
}
