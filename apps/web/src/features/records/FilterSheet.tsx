import {
  activeFilterCount,
  CATEGORIES,
  categoryCountLabel,
  categoryShortLabel,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import { tagKey } from "@repo/schema";
import { ResponsiveSheet, SheetDrawerHeader } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { CountBadge } from "@repo/ui/components/CountBadge";
import { FilterTile } from "@repo/ui/components/FilterTile";
import { TagPill } from "@repo/ui/components/TagPill";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { ListFilterIcon } from "lucide-react";
import { useState } from "react";
import { CATEGORY_ICONS } from "./CategorySidebar";

const TITLE = "Filter";
const SECTION_LABEL = "font-semibold text-muted-foreground text-xs uppercase tracking-wider";

export function FilterButton() {
  const { query, categoryFilter, tagFilters } = useSortedRecords();
  const [open, setOpen] = useState(false);
  // A search ignores category and tags.
  const active = query.trim() ? 0 : activeFilterCount(categoryFilter, tagFilters);

  return (
    <>
      <Button
        variant="floating"
        size="fab"
        aria-label={active > 0 ? `Filter (${active} on)` : "Filter"}
        className="relative"
        onClick={() => setOpen(true)}
      >
        <ListFilterIcon className="size-5" />
        {active > 0 && <CountBadge count={active} tone="primary" className="top-0 right-0" />}
      </Button>
      <FilterSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Category and tags, applied as they're picked: the button only closes. */
export function FilterSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    categoryFilter,
    setCategoryFilter,
    categoryCounts,
    tags,
    tagFilters,
    toggleTag,
    removeTag,
    clearFilters,
  } = useSortedRecords();
  const isMobile = useIsMobile();
  const selected = new Set(tagFilters.map(tagKey));

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={TITLE}
      actions={
        <div className="flex items-center gap-2">
          {isMobile && <SheetDrawerHeader title={TITLE} />}
          <Button
            variant="ghost"
            size="lg"
            className="ml-auto text-primary-text"
            disabled={activeFilterCount(categoryFilter, tagFilters) === 0}
            onClick={clearFilters}
          >
            Reset
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 px-4 sm:px-5">
        <section aria-labelledby="filter-category" className="flex flex-col gap-2.5">
          <h3 id="filter-category" className={SECTION_LABEL}>
            Category
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((category) => (
              <FilterTile
                key={category}
                icon={CATEGORY_ICONS[category]}
                label={categoryShortLabel(category)}
                count={categoryCounts[category]}
                active={category === categoryFilter}
                aria-pressed={category === categoryFilter}
                onClick={() => setCategoryFilter(category)}
              />
            ))}
          </div>
        </section>

        {tags.length > 0 && (
          <section aria-labelledby="filter-tags" className="flex flex-col gap-2.5">
            <h3 id="filter-tags" className={SECTION_LABEL}>
              Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {tags.map(({ tag, count }) =>
                selected.has(tagKey(tag)) ? (
                  <TagPill key={tagKey(tag)} tag={tag} selected onClick={() => removeTag(tag)} />
                ) : (
                  <TagPill
                    key={tagKey(tag)}
                    tag={tag}
                    count={count}
                    disabled={count === 0}
                    onClick={() => toggleTag(tag)}
                  />
                ),
              )}
            </div>
          </section>
        )}

        <Button size="lg" className="w-full rounded-full" onClick={() => onOpenChange(false)}>
          Show {categoryCountLabel(categoryFilter, categoryCounts[categoryFilter])}
        </Button>
      </div>
    </ResponsiveSheet>
  );
}
