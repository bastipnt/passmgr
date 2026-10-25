import { categoryLabel, useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import { tagKey } from "@repo/schema";
import { FilterChip } from "@repo/ui/components/FilterChip";
import { CATEGORY_ICONS } from "./CategorySidebar";

export function ActiveFilterChips() {
  const { query, categoryFilter, setCategoryFilter, tagFilters, removeTag } = useSortedRecords();
  // A search ignores category and tags.
  if (query.trim() || (categoryFilter === "all" && tagFilters.length === 0)) return null;
  const CategoryIcon = CATEGORY_ICONS[categoryFilter];
  const category = categoryLabel(categoryFilter);

  return (
    <ul aria-label="Active filters" className="flex flex-wrap gap-2 px-5 pt-1 pb-2">
      {categoryFilter !== "all" && (
        <li>
          <FilterChip
            label={category}
            icon={<CategoryIcon />}
            removeLabel={`Remove filter ${category}`}
            onClick={() => setCategoryFilter("all")}
          />
        </li>
      )}
      {tagFilters.map((tag) => (
        <li key={tagKey(tag)}>
          <FilterChip
            label={tag}
            icon="#"
            removeLabel={`Remove tag ${tag}`}
            onClick={() => removeTag(tag)}
          />
        </li>
      ))}
    </ul>
  );
}
