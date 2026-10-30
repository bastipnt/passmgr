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
import {
  addRecentSearch,
  filterByTagText,
  matchRecords,
  parseSearch,
  type RecentSearch,
  type RecordMatch,
  sameSearch,
  TAG_SEARCH_PREFIX,
} from "../records/record-search";
import { collectTags, filterByTags, type TagCount } from "../records/tags";
import type { VaultFilter, VaultInfo } from "../vaults/vault-info";

export type SortOption = "most-recent" | "alphabetical" | "newest" | "oldest";
export type RecordGroup = {
  label: string | null;
  records: DecryptedRecord[];
  /** "By vault": the group's vault; `folded` hides its records (kept for the count). */
  vault?: VaultInfo;
  folded?: boolean;
};
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

/** The label of the starred records' group, atop the list in every sort (not "By vault"). */
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

/**
 * "By vault": a group per vault in the vaults' order, each in the list's order
 * with its starred records first (no favorites group across vaults).
 */
function groupRecordsByVault(
  sortedRecords: DecryptedRecord[],
  vaults: readonly VaultInfo[],
  folded: ReadonlySet<string>,
): RecordGroup[] {
  return vaults.flatMap((vault) => {
    const records = sortedRecords.filter((record) => record.vaultId === vault.vaultId);
    if (records.length === 0) return [];
    return [
      {
        label: vault.name,
        vault,
        folded: folded.has(vault.vaultId),
        records: [
          ...records.filter((record) => record.favorite),
          ...records.filter((record) => !record.favorite),
        ],
      },
    ];
  });
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

/** The records a query finds: tag mode lists those carrying a matching tag. */
function searchRecords(records: DecryptedRecord[], query: string): DecryptedRecord[] {
  const { tagMode, text } = parseSearch(query);
  return tagMode
    ? filterByTagText(records, text)
    : matchRecords(records, text).map(({ record }) => record);
}

const RECENT_LIMIT = 5;

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
 * The list's title: what it shows. While searching, the results; otherwise
 * the vault in view, the category and the tags it's narrowed to.
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
  /** "By vault" is on (a device preference); it applies only while `canGroupByVault`. */
  groupByVault: boolean;
  setGroupByVault: (on: boolean) => void;
  /** "All vaults" with more than one in view. */
  canGroupByVault: boolean;
  /** "By vault" folds, for this session only. */
  toggleVaultFold: (vaultId: string) => void;
  /** Rows mark their vault on the avatar: "All vaults" with several, unless grouped by vault. */
  showVaultBadges: boolean;
  /** The list's category. A search keeps to it, unless `searchAll`. */
  categoryFilter: CategoryFilter;
  setCategoryFilter: (category: CategoryFilter) => void;
  /** How many records each category holds, in the vault and tags in view. */
  categoryCounts: Record<CategoryFilter, number>;
  /** The list's vault filter ("All vaults" or one). A search keeps to it, unless `searchAll`. */
  vaultFilter: VaultFilter;
  /** Picks the vault in view and shows all of it again (category "all"). */
  setVaultFilter: (vault: VaultFilter) => void;
  /**
   * The selected tags, in the order picked, for this session only; a record
   * must carry every one. A search keeps to them, unless `searchAll`.
   */
  tagFilters: string[];
  toggleTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  clearTags: () => void;
  setTags: (tags: readonly string[]) => void;
  /** Back to the whole vault in view: category "all", no tags. */
  clearFilters: () => void;
  /** Clears the filters (vault too) when they hide `record`, so the list shows it (opened from "Search all items"). */
  revealRecord: (record: DecryptedRecord) => void;
  /** The list's search field, so others can focus it. */
  searchInputRef: RefObject<{ focus: () => void; blur: () => void } | null>;
  /** Focuses the search with the tag prefix typed. */
  searchTags: () => void;
  /**
   * Whether a query starting with `#` searches tags only (tag mode). The phone
   * search turns it off while mounted: there a `#` is dropped and the rest searched.
   */
  tagSearch: boolean;
  setTagSearch: (on: boolean) => void;
  /**
   * The tags of the vault in view (of every vault for "All vaults"), the
   * selected ones first, then A–Z. `count`: the records left with the tag
   * added to the category and tags in view (0 for a tag that would empty it).
   */
  tags: TagCount[];
  /** Every record carrying `tag`: the other filters and the search cleared. */
  showTag: (tag: string) => void;
  /** The listed records in the order shown, folded groups left out. */
  sortedRecords: DecryptedRecord[];
  recordGroups: RecordGroup[];
  /** Whether any group carries a label (none do while searching). */
  hasGroupLabels: boolean;
  /** The search's records with why each matched (none in tag mode or without a query). */
  recordMatches: RecordMatch[];
  /**
   * Records the search finds that the vault, category or tags hide; empty
   * while `searchAll` or in tag mode.
   */
  outsideScope: DecryptedRecord[];
  /** The search runs past vault, category and tags. Ends with the query or once the filters change. */
  searchAll: boolean;
  searchAllItems: () => void;
  /** A filter narrows the search (a vault only counts with several), so "Search all" would widen it. */
  canSearchAll: boolean;
  /** Session only. */
  recentRecords: DecryptedRecord[];
  noteOpened: (recordId: string) => void;
  /**
   * Session only, in memory: a query can tell which accounts someone has, so
   * it's never written to storage.
   */
  recentSearches: RecentSearch[];
  noteSearched: (search: RecentSearch) => void;
  forgetSearch: (search: RecentSearch) => void;
  clearRecentSearches: () => void;
  /** How many records a search finds in the vault and category in view, under its own tags. */
  countSearch: (search: RecentSearch) => number;
};

const SortedRecordsContext = createContext<SortedRecordsContextValue | null>(null);

export function useSortedRecords(): SortedRecordsContextValue {
  const ctx = useContext(SortedRecordsContext);
  if (!ctx) throw new Error("useSortedRecords must be used within SortedRecordsProvider");
  return ctx;
}

/**
 * Search without touching the provider's own `query`. Mobile
 * has a dedicated search tab whose input must not filter the records tab, so it
 * keeps its query in local state and groups the results through this hook.
 * An empty query falls back to the regular sorted grouping of the records
 * `filters` let through (the records tab passes the list's); a search keeps to
 * them too, as the provider's does.
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
      {
        label: null,
        records: searchRecords(filterRecords(records, { category, vault, tags }), trimmed),
      },
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
  const [query, setStoredQuery] = useState("");
  const [tagSearch, setTagSearch] = useState(true);
  const [searchAllFor, setSearchAllFor] = useState<string | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [storedSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [vaultFilter, setStoredVaultFilter] = useVaultFilter();
  const vaultTags = useTags(vaultFilter);
  const [tagFilters, setTagFilters] = useTagFilters(vaultTags);
  const { vaults, hasSeveralVaults } = useVaults();
  const [storedGroupByVault, setGroupByVault] = usePreference<boolean>(
    PREF_KEYS.groupByVault,
    false,
  );
  const groupByVault = storedGroupByVault === true;
  const [foldedVaults, setFoldedVaults] = useState<ReadonlySet<string>>(() => new Set());
  const [storedSort, setStoredSort] = usePreference<SortOption>(PREF_KEYS.sort, DEFAULT_SORT);
  // localStorage is user-editable and older builds wrote unvalidated values.
  const sort = storedSort in SORT_LABELS ? storedSort : DEFAULT_SORT;

  const search = useMemo(() => parseSearch(query, tagSearch), [query, tagSearch]);
  // A lone `#` with tag search off searches nothing yet.
  const hasQuery = search.tagMode || search.text !== "";
  const canGroupByVault = vaultFilter === "all" && hasSeveralVaults;
  const groupedByVault = groupByVault && canGroupByVault && !hasQuery;
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

  const filtersKey = [vaultFilter, categoryFilter, ...tagFilters.map(tagKey)].join("\u0000");
  const searchAll = searchAllFor === filtersKey;
  const searchScope = searchAll ? records : browsed;
  const canSearchAll =
    !searchAll &&
    (activeFilterCount(categoryFilter, tagFilters) > 0 ||
      (vaultFilter !== "all" && hasSeveralVaults));
  const recordMatches = useMemo(
    () => (hasQuery && !search.tagMode ? matchRecords(searchScope, search.text) : []),
    [hasQuery, search, searchScope],
  );
  // Counted rather than hidden, so a match the filters keep out doesn't read as "not in the vault".
  const outsideScope = useMemo(() => {
    if (!hasQuery || search.tagMode || searchScope === records) return [];
    const inScope = new Set(recordMatches.map(({ record }) => record.recordId));
    return matchRecords(records, search.text)
      .map(({ record }) => record)
      .filter((record) => !inScope.has(record.recordId));
  }, [recordMatches, hasQuery, search, searchScope, records]);

  const recordGroups = useMemo(
    () =>
      hasQuery
        ? [
            {
              label: null,
              records: search.tagMode
                ? filterByTagText(searchScope, search.text)
                : recordMatches.map(({ record }) => record),
            },
          ]
        : groupedByVault
          ? groupRecordsByVault(sortRecords(browsed, sort), vaults, foldedVaults)
          : groupRecords(sortRecords(browsed, sort), sort, categoryFilter),
    [
      hasQuery,
      search,
      searchScope,
      recordMatches,
      browsed,
      sort,
      categoryFilter,
      groupedByVault,
      vaults,
      foldedVaults,
    ],
  );
  // In the order shown, so arrow keys walk the list as it reads.
  const sortedRecords = useMemo(
    () => recordGroups.flatMap((recordGroup) => (recordGroup.folded ? [] : recordGroup.records)),
    [recordGroups],
  );

  const toggleVaultFold = useCallback(
    (vaultId: string) =>
      setFoldedVaults((folded) => {
        const next = new Set(folded);
        if (!next.delete(vaultId)) next.add(vaultId);
        return next;
      }),
    [],
  );

  const hasGroupLabels = recordGroups.some((recordGroup) => recordGroup.label);

  const setQuery = useCallback(
    (next: string) => {
      setStoredQuery(next);
      // Tag mode lists tags, not past the filters.
      if (!next.trim() || parseSearch(next, tagSearch).tagMode) setSearchAllFor(null);
    },
    [tagSearch],
  );
  const searchAllItems = useCallback(() => setSearchAllFor(filtersKey), [filtersKey]);

  const noteOpened = useCallback(
    (recordId: string) =>
      setRecentIds((ids) =>
        ids[0] === recordId
          ? ids
          : [recordId, ...ids.filter((id) => id !== recordId)].slice(0, RECENT_LIMIT),
      ),
    [],
  );
  const noteSearched = useCallback(
    (search: RecentSearch) => setRecentSearches((searches) => addRecentSearch(searches, search)),
    [],
  );
  const forgetSearch = useCallback(
    (search: RecentSearch) =>
      setRecentSearches((searches) => searches.filter((own) => !sameSearch(own, search))),
    [],
  );
  const clearRecentSearches = useCallback(() => setRecentSearches([]), []);
  // One whose tag the vault in view doesn't have would run without it.
  const recentSearches = useMemo(() => {
    const known = new Set(vaultTags.map(({ tag }) => tagKey(tag)));
    return storedSearches.filter(({ tags }) => tags.every((tag) => known.has(tagKey(tag))));
  }, [storedSearches, vaultTags]);
  const countSearch = useCallback(
    ({ text, tags }: RecentSearch) => {
      const scope = filterRecords(vaultRecords, { category: categoryFilter, tags });
      return text.trim() ? matchRecords(scope, text.trim()).length : scope.length;
    },
    [vaultRecords, categoryFilter],
  );

  const recentRecords = useMemo(() => {
    const byId = new Map(vaultRecords.map((record) => [record.recordId, record]));
    return recentIds.flatMap((id) => byId.get(id) ?? []);
  }, [recentIds, vaultRecords]);

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
  const setTags = useCallback(
    (tags: readonly string[]) =>
      setTagFilters((selected) =>
        selected.map(tagKey).join("\0") === tags.map(tagKey).join("\0") ? selected : [...tags],
      ),
    [setTagFilters],
  );
  const clearTags = useCallback(() => setTags([]), [setTags]);
  const clearFilters = useCallback(() => {
    setCategoryFilter("all");
    clearTags();
  }, [clearTags]);
  const revealRecord = useCallback(
    (record: DecryptedRecord) => {
      // Not `setVaultFilter`: it would drop a category that still shows the record.
      if (filterByVault([record], vaultFilter).length === 0) setStoredVaultFilter("all");
      if (filterRecords([record], { category: categoryFilter, tags: tagFilters }).length === 0)
        clearFilters();
    },
    [vaultFilter, setStoredVaultFilter, categoryFilter, tagFilters, clearFilters],
  );

  const searchInputRef = useRef<{ focus: () => void; blur: () => void } | null>(null);
  const searchTags = useCallback(() => {
    setQuery(TAG_SEARCH_PREFIX);
    searchInputRef.current?.focus();
  }, [setQuery]);

  // The vault and category may hide every record with the tag (its record was
  // opened from a search), which would drop the tag right away.
  const showTag = useCallback(
    (tag: string) => {
      setQuery("");
      setVaultFilter("all");
      setTags([tag]);
    },
    [setQuery, setVaultFilter, setTags],
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
      groupByVault,
      setGroupByVault,
      canGroupByVault,
      toggleVaultFold,
      showVaultBadges: canGroupByVault && !groupedByVault,
      categoryFilter,
      setCategoryFilter,
      categoryCounts,
      vaultFilter,
      setVaultFilter,
      tagFilters,
      toggleTag,
      removeTag,
      clearTags,
      setTags,
      clearFilters,
      revealRecord,
      searchInputRef,
      searchTags,
      tagSearch,
      setTagSearch,
      tags,
      showTag,
      sortedRecords,
      recordGroups,
      hasGroupLabels,
      recordMatches,
      outsideScope,
      searchAll,
      searchAllItems,
      canSearchAll,
      recentRecords,
      noteOpened,
      recentSearches,
      noteSearched,
      forgetSearch,
      clearRecentSearches,
      countSearch,
    }),
    [
      query,
      setQuery,
      sort,
      handleSortChange,
      groupByVault,
      setGroupByVault,
      canGroupByVault,
      toggleVaultFold,
      groupedByVault,
      categoryFilter,
      categoryCounts,
      vaultFilter,
      setVaultFilter,
      tagFilters,
      toggleTag,
      removeTag,
      clearTags,
      setTags,
      clearFilters,
      revealRecord,
      searchTags,
      tagSearch,
      setTagSearch,
      tags,
      showTag,
      sortedRecords,
      recordGroups,
      hasGroupLabels,
      recordMatches,
      outsideScope,
      searchAll,
      searchAllItems,
      canSearchAll,
      recentRecords,
      noteOpened,
      recentSearches,
      noteSearched,
      forgetSearch,
      clearRecentSearches,
      countSearch,
    ],
  );

  return <SortedRecordsContext value={value}>{children}</SortedRecordsContext>;
}
