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
 */
export function useSearchOptions({ listTagged = false }: { listTagged?: boolean } = {}) {
  const {
    query,
    categoryFilter,
    tagFilters,
    tags,
    recordMatches,
    recentRecords,
    recordGroups,
    searchAll,
  } = useSortedRecords();
  const search = useMemo(() => parseSearch(query), [query]);
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

  const sections = useMemo(
    () =>
      searchOptionSections(
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
      ),
    [search, tags, tagFilters, recordMatches, recentRecords, tagged, searchAll, categoryFilter],
  );
  const options = useMemo(() => sections.flatMap((section) => section.options), [sections]);

  return { search, sections, options };
}
