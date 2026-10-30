import { useMemo } from "react";
import { categoryLabel, useSortedRecords } from "../providers/SortedRecordsProvider";
import {
  parseSearch,
  searchOptionSections,
  searchSections,
  type TaggedRecords,
} from "../records/record-search";

/**
 * What the search lists for the current query and filters, for any search UI to render.
 * `listTagged`: with tags selected and nothing typed, list their records instead of the recent ones.
 * `withTags: false`: records only (a record whose tag matches still shows), no tag rows.
 */
export function useSearchOptions({
  listTagged = false,
  withTags = true,
}: {
  listTagged?: boolean;
  withTags?: boolean;
} = {}) {
  const {
    query,
    categoryFilter,
    tagFilters,
    tags,
    recordMatches,
    recentRecords,
    recordGroups,
    searchAll,
    tagSearch,
  } = useSortedRecords();
  const search = useMemo(() => parseSearch(query, tagSearch), [query, tagSearch]);
  const tagged = useMemo<TaggedRecords | undefined>(
    () =>
      listTagged && tagFilters.length > 0 && !search.text && !search.tagMode
        ? {
            // Folded vault groups too: the search lists past the folds.
            records: recordGroups.flatMap(({ records }) => records),
            category: categoryFilter === "all" ? undefined : categoryLabel(categoryFilter),
          }
        : undefined,
    [listTagged, tagFilters.length, search, recordGroups, categoryFilter],
  );

  const sections = useMemo(() => {
    const all = searchOptionSections(
      searchSections({
        search,
        tags,
        selectedCount: tagFilters.length,
        recordMatches,
        recentRecords,
        tagged,
        recordsLabel:
          searchAll || categoryFilter === "all" ? "Records" : categoryLabel(categoryFilter),
      }),
      tagFilters,
    );
    return withTags
      ? all
      : all
          .map((section) => ({
            ...section,
            options: section.options.filter((option) => option.kind === "record"),
          }))
          .filter((section) => section.options.length > 0);
  }, [
    search,
    tags,
    tagFilters,
    recordMatches,
    recentRecords,
    tagged,
    searchAll,
    categoryFilter,
    withTags,
  ]);
  const options = useMemo(() => sections.flatMap((section) => section.options), [sections]);

  return { search, sections, options };
}
