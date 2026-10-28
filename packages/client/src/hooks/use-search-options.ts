import { useMemo } from "react";
import { categoryLabel, useSortedRecords } from "../providers/SortedRecordsProvider";
import { parseSearch, searchOptionSections, searchSections } from "../records/record-search";

/** What the search lists for the current query and filters, for any search UI to render. */
export function useSearchOptions() {
  const { query, categoryFilter, tagFilters, tags, recordMatches, recentRecords, searchAll } =
    useSortedRecords();
  const search = useMemo(() => parseSearch(query), [query]);

  const sections = useMemo(
    () =>
      searchOptionSections(
        searchSections({
          search,
          tags,
          selectedCount: tagFilters.length,
          recordMatches,
          recentRecords,
          recordsLabel:
            searchAll || categoryFilter === "all" ? "Records" : categoryLabel(categoryFilter),
        }),
        tagFilters,
      ),
    [search, tags, tagFilters, recordMatches, recentRecords, searchAll, categoryFilter],
  );
  const options = useMemo(() => sections.flatMap((section) => section.options), [sections]);

  return { search, sections, options };
}
