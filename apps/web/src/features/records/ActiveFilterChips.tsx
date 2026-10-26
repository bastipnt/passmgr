import { categoryLabel, useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import { tagKey } from "@repo/schema";
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
  const tone = desktop ? "neutral" : "accent";

  return (
    <div
      className={
        desktop
          ? "flex items-center gap-1 rounded-2xl bg-foreground/4 px-0.5 py-0.5 dark:bg-white/6"
          : "px-5 pt-1 pb-2"
      }
    >
      <ul
        aria-label="Active filters"
        className={cn(
          "flex",
          desktop
            ? "min-w-0 flex-1 gap-1.5 overflow-x-auto p-1 [scrollbar-width:none]"
            : "flex-wrap gap-2",
        )}
      >
        {categoryFilter !== "all" && (
          <li>
            <FilterChip
              label={category}
              icon={<CategoryIcon />}
              removeLabel={`Remove filter ${category}`}
              tone={tone}
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
              tone={tone}
              onClick={() => removeTag(tag)}
            />
          </li>
        ))}
      </ul>
      {desktop && (
        <button
          type="button"
          onClick={clearFilters}
          className="shrink-0 rounded-full px-2 font-semibold text-primary-text text-sm outline-none hover:underline focus-visible:ring-4 focus-visible:ring-ring/25"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
