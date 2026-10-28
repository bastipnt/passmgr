import { type DecryptedRecord, isRecordType, tagKey } from "@repo/schema";
import { getRecordSubtitle } from "./record-summary";
import type { TagCount } from "./tags";

/** A query starting with this matches tags only. */
export const TAG_SEARCH_PREFIX = "#";

export type ParsedSearch = { tagMode: boolean; text: string };

export function parseSearch(query: string): ParsedSearch {
  const trimmed = query.trimStart();
  const tagMode = trimmed.startsWith(TAG_SEARCH_PREFIX);
  return {
    tagMode,
    text: (tagMode ? trimmed.slice(TAG_SEARCH_PREFIX.length) : trimmed).trim(),
  };
}

/** Where a query was found: `[start, end)` in that text. */
export type MatchRange = { start: number; end: number };

export function matchRange(text: string, query: string): MatchRange | undefined {
  if (!query) return undefined;
  const start = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  return start < 0 ? undefined : { start, end: start + query.length };
}

/** Why a record matched, in tier order. A `tag` match names the tag. */
export type RecordMatch =
  | { record: DecryptedRecord; field: "title" }
  | { record: DecryptedRecord; field: "subtitle"; subtitle: string }
  | { record: DecryptedRecord; field: "tag"; tag: string };

// A login's subtitle is its username when it has one, which would hide the email.
function searchedSubtitles(record: DecryptedRecord): string[] {
  const subtitle = getRecordSubtitle(record);
  const email = isRecordType(record, "login") ? record.email : undefined;
  return [subtitle, email !== subtitle ? email : undefined].filter(
    (value): value is string => !!value,
  );
}

/** Title matches first, then subtitle (username, email, number…) matches, then tag matches. */
export function matchRecords(records: readonly DecryptedRecord[], text: string): RecordMatch[] {
  if (!text) return records.map((record) => ({ record, field: "title" }));
  const tiers: [RecordMatch[], RecordMatch[], RecordMatch[]] = [[], [], []];
  for (const record of records) {
    if (matchRange(record.title, text)) {
      tiers[0].push({ record, field: "title" });
      continue;
    }
    const subtitle = searchedSubtitles(record).find((value) => matchRange(value, text));
    if (subtitle) {
      tiers[1].push({ record, field: "subtitle", subtitle });
      continue;
    }
    const tag = record.tags?.find((own) => matchRange(own, text));
    if (tag) tiers[2].push({ record, field: "tag", tag });
  }
  return tiers.flat();
}

/** The records carrying a tag that contains `text` (every tagged one for none). */
export function filterByTagText(
  records: readonly DecryptedRecord[],
  text: string,
): DecryptedRecord[] {
  return records.filter((record) =>
    record.tags?.some((tag) => !text || matchRange(tag, text) !== undefined),
  );
}

export function matchTags(tags: readonly TagCount[], text: string): TagCount[] {
  return text ? tags.filter(({ tag }) => matchRange(tag, text)) : [...tags];
}

/** The most used first; ties A–Z, as `tags` comes. */
export function topTags(tags: readonly TagCount[], limit: number): TagCount[] {
  return [...tags].sort((a, b) => b.count - a.count).slice(0, limit);
}

/**
 * Tag mode's two lists: the selected tags, then the others matching `text`
 * that leave records in view; `other` holds the rest (shown dimmed).
 * `tags` comes as `useSortedRecords().tags`: selected first, `count` in scope.
 */
export function tagModeGroups(
  tags: readonly TagCount[],
  selectedCount: number,
  text: string,
): { matching: TagCount[]; other: TagCount[] } {
  const matching: TagCount[] = [];
  const other: TagCount[] = [];
  tags.forEach((entry, index) => {
    const narrows = entry.count > 0 && (!text || matchRange(entry.tag, text) !== undefined);
    (index < selectedCount || narrows ? matching : other).push(entry);
  });
  return { matching, other };
}

export type PillTag = TagCount & { on: boolean; matching: boolean };

/**
 * The phone search's tag pills: the selected tags, then those matching `text`,
 * then the rest by use. `tags` comes as `useSortedRecords().tags`: selected first.
 */
export function pillTags(
  tags: readonly TagCount[],
  selectedCount: number,
  text: string,
): PillTag[] {
  const selected = tags
    .slice(0, selectedCount)
    .map((entry) => ({ ...entry, on: true, matching: false }));
  const rest = tags.slice(selectedCount).map((entry) => ({
    ...entry,
    on: false,
    matching: text !== "" && matchRange(entry.tag, text) !== undefined,
  }));
  const byUse = (entries: PillTag[]) => topTags(entries, entries.length) as PillTag[];
  return [
    ...selected,
    ...byUse(rest.filter(({ matching }) => matching)),
    ...byUse(rest.filter(({ matching }) => !matching)),
  ];
}

export type SearchItem =
  | { kind: "tag"; tag: string; count: number; dimmed?: boolean }
  | { kind: "record"; record: DecryptedRecord; match?: RecordMatch };

export type SearchSection = { id: string; label: string; aside?: string; items: SearchItem[] };

/** A search to offer again: its text and the tag filters it ran with. */
export type RecentSearch = { text: string; tags: string[] };

export const RECENT_SEARCH_LIMIT = 5;

/** Identifies a search: text without case, tags in any order. */
export function recentSearchKey({ text, tags }: RecentSearch): string {
  return [text.trim().toLocaleLowerCase(), ...tags.map(tagKey).sort()].join("\0");
}

export function sameSearch(a: RecentSearch, b: RecentSearch): boolean {
  return recentSearchKey(a) === recentSearchKey(b);
}

/** Newest first, once each (text without case, tags in any order); an empty search isn't kept. */
export function addRecentSearch(
  searches: readonly RecentSearch[],
  search: RecentSearch,
  limit = RECENT_SEARCH_LIMIT,
): RecentSearch[] {
  const entry = { text: search.text.trim(), tags: [...search.tags] };
  if (!entry.text && entry.tags.length === 0) return [...searches];
  return [entry, ...searches.filter((own) => !sameSearch(own, entry))].slice(0, limit);
}

/** A listed item with a stable `id`; a tag's `on` says whether it is one of the selected filters. */
export type SearchOption = SearchItem & { id: string; on?: boolean };

export type SearchOptionSection = Omit<SearchSection, "items"> & { options: SearchOption[] };

export function searchOptionSections(
  sections: readonly SearchSection[],
  selectedTags: readonly string[],
): SearchOptionSection[] {
  const selected = new Set(selectedTags.map(tagKey));
  return sections.map(({ items, ...section }) => ({
    ...section,
    options: items.map((item) =>
      item.kind === "tag"
        ? { ...item, id: `tag:${tagKey(item.tag)}`, on: selected.has(tagKey(item.tag)) }
        : { ...item, id: `record:${item.record.recordId}` },
    ),
  }));
}

const TOP_TAGS = 4;

/** "Tagged #a + #b", or "Logins tagged #a" when a category narrows it too. */
export function taggedLabel(tags: readonly string[], category?: string): string {
  const named = tags.map((tag) => `${TAG_SEARCH_PREFIX}${tag}`).join(" + ");
  return category ? `${category} tagged ${named}` : `Tagged ${named}`;
}

/** The records the selected tags leave in view, listed instead of the recent ones. */
export type TaggedRecords = { records: readonly DecryptedRecord[]; category?: string };

/**
 * What a search lists, in order. Nothing typed: the top tags, then the
 * records the selected tags leave (when `tagged` is given), else the recent records. Typed: the matching tags, then the records. Tag mode: the tags
 * that narrow the view, then the rest (dimmed).
 */
export function searchSections({
  search,
  tags,
  selectedCount,
  recordMatches,
  recentRecords,
  tagged,
  recordsLabel,
}: {
  search: ParsedSearch;
  /** As `useSortedRecords().tags`: selected first, `count` in scope. */
  tags: readonly TagCount[];
  selectedCount: number;
  recordMatches: readonly RecordMatch[];
  recentRecords: readonly DecryptedRecord[];
  tagged?: TaggedRecords;
  recordsLabel: string;
}): SearchSection[] {
  const tagItem = ({ tag, count }: TagCount, dimmed?: boolean): SearchItem => ({
    kind: "tag",
    tag,
    count,
    dimmed,
  });
  const recordItem = (record: DecryptedRecord, match?: RecordMatch): SearchItem => ({
    kind: "record",
    record,
    match,
  });
  if (search.tagMode) {
    const { matching, other } = tagModeGroups(tags, selectedCount, search.text);
    return [
      {
        id: "matching",
        label: search.text ? `Tags matching “${search.text}”` : "Narrow further",
        items: matching.map((entry) => tagItem(entry)),
      },
      { id: "other", label: "Other tags", items: other.map((entry) => tagItem(entry, true)) },
    ];
  }
  if (!search.text)
    return [
      { id: "top", label: "Top tags", items: topTags(tags, TOP_TAGS).map((e) => tagItem(e)) },
      tagged && selectedCount > 0
        ? {
            id: "tagged",
            label: taggedLabel(
              tags.slice(0, selectedCount).map(({ tag }) => tag),
              tagged.category,
            ),
            items: tagged.records.map((record) => recordItem(record)),
          }
        : {
            id: "recent",
            label: "Recently opened",
            items: recentRecords.map((record) => recordItem(record)),
          },
    ];
  return [
    {
      id: "tags",
      label: "Tags",
      aside: "only tags: start with",
      items: matchTags(tags, search.text).map((entry) => tagItem(entry)),
    },
    {
      id: "records",
      label: recordsLabel,
      items: recordMatches.map((match) => recordItem(match.record, match)),
    },
  ];
}
