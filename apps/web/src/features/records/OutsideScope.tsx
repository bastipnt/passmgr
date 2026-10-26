import { RECORD_TYPE_LABELS, TAG_SEARCH_PREFIX } from "@repo/client";
import { categoryLabel, useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import { cn } from "@repo/ui/lib/utils";

/** The search's matches the category and tags hide, with a way to widen it past them. */
export function OutsideScope({ className }: { className?: string }) {
  const { outsideScope, categoryFilter, tagFilters, searchAllItems } = useSortedRecords();
  if (outsideScope.length === 0) return null;
  const scope = [
    categoryFilter === "all" ? undefined : categoryLabel(categoryFilter),
    ...tagFilters.map((tag) => `${TAG_SEARCH_PREFIX}${tag}`),
  ]
    .filter(Boolean)
    .join(" · ");
  const examples = outsideScope
    .slice(0, 2)
    .map((record) => `${record.title} in ${RECORD_TYPE_LABELS[record.type].plural}`)
    .join(", ");

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border border-dashed px-3.5 py-3",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">
          {outsideScope.length} more outside {scope}
        </p>
        <p className="truncate text-muted-foreground text-xs">{examples}</p>
      </div>
      <button
        type="button"
        onClick={searchAllItems}
        className="shrink-0 rounded-full px-2 font-semibold text-primary-text text-sm outline-none hover:underline focus-visible:ring-4 focus-visible:ring-ring/25"
      >
        Search all items
      </button>
    </div>
  );
}
