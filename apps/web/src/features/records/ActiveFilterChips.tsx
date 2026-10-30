import {
  activeFilterCount,
  categoryLabel,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import { tagKey } from "@repo/schema";
import { ChipLane } from "@repo/ui/components/ChipLane";
import { FilterChip } from "@repo/ui/components/FilterChip";
import { cn } from "@repo/ui/lib/utils";
import { CATEGORY_ICONS } from "./CategorySidebar";

export function ActiveFilterChips({ variant = "phone" }: { variant?: "phone" | "desktop" }) {
  const { categoryFilter, setCategoryFilter, tagFilters, removeTag, clearFilters } =
    useSortedRecords();
  if (categoryFilter === "all" && tagFilters.length === 0) return null;
  const CategoryIcon = CATEGORY_ICONS[categoryFilter];
  const category = categoryLabel(categoryFilter);
  const desktop = variant === "desktop";
  const chipClass = desktop ? undefined : "h-9 text-[0.9rem]";
  // Phone: with a single filter its chip's × already does it.
  const showClearAll = desktop || activeFilterCount(categoryFilter, tagFilters) > 1;

  return (
    <ChipLane
      label="Active filters"
      className={desktop ? undefined : "mx-5 mt-1 mb-2"}
      action={
        showClearAll && (
          <button
            type="button"
            onClick={clearFilters}
            className={cn(
              "shrink-0 rounded-full px-3 font-semibold text-primary-text text-sm outline-none hover:underline focus-visible:ring-4 focus-visible:ring-ring/25",
              !desktop && "h-10",
            )}
          >
            Clear all
          </button>
        )
      }
    >
      {categoryFilter !== "all" && (
        <li>
          <FilterChip
            label={category}
            icon={<CategoryIcon />}
            removeLabel={`Remove filter ${category}`}
            tone="neutral"
            className={chipClass}
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
            tone="neutral"
            className={chipClass}
            onClick={() => removeTag(tag)}
          />
        </li>
      ))}
    </ChipLane>
  );
}
