import type { CategoryFilter, SortOption } from "@repo/client/src/providers/SortedRecordsProvider";
import {
  CATEGORIES,
  categoryLabel,
  SORT_LABELS,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import { cn } from "@repo/ui/lib/utils";
import { ArrowUpDownIcon, TagIcon } from "lucide-react";

type RecordSortMenuProps = {
  /** `fab`: a round icon button for the phone's bottom dock, opening upward. */
  variant?: "inline" | "fab";
};

/**
 * The sort order. On phones (`fab`) also the category and tag filters, which
 * desktop has in the `CategorySidebar` and the `TagBar`.
 */
export function RecordSortMenu({ variant = "inline" }: RecordSortMenuProps) {
  const {
    sort,
    handleSortChange,
    categoryFilter,
    setCategoryFilter,
    tagFilters,
    toggleTag,
    clearTags,
    tags,
  } = useSortedRecords();
  const fab = variant === "fab";
  const filtered = categoryFilter !== "all" || tagFilters.length > 0;
  const showing = [
    categoryFilter === "all" ? undefined : categoryLabel(categoryFilter),
    tagFilters.length === 0 ? undefined : `tagged ${tagFilters.join(", ")}`,
  ].filter(Boolean);
  const accessibleName = `Sort: ${SORT_LABELS[sort]}${showing.length > 0 ? `, showing ${showing.join(" ")}` : ""}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          fab ? (
            <Button
              variant="floating"
              size="fab"
              aria-label={accessibleName}
              // A dot on the button: a category or tags narrow the list.
              className={cn(
                filtered &&
                  "relative after:absolute after:top-2.5 after:right-2.5 after:size-2 after:rounded-full after:bg-primary",
              )}
            >
              <ArrowUpDownIcon className="size-5" />
            </Button>
          ) : (
            // The visible label is the current sort; "Sort:" keeps the purpose
            // in the accessible name without dropping the visible text (WCAG 2.5.3).
            <Button variant="ghost" size="sm" className="text-primary dark:text-ring">
              <span className="sr-only">Sort: </span>
              <ArrowUpDownIcon />
              {SORT_LABELS[sort]}
            </Button>
          )
        }
      />
      <DropdownMenuContent
        align="end"
        side={fab ? "top" : "bottom"}
        sideOffset={fab ? 8 : 4}
        className={fab ? "w-auto min-w-48" : undefined}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={sort} onValueChange={handleSortChange}>
            {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([value, label]) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {fab && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Show</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={categoryFilter}
                onValueChange={(value) => setCategoryFilter(value as CategoryFilter)}
              >
                {CATEGORIES.map((category) => (
                  <DropdownMenuRadioItem key={category} value={category}>
                    {categoryLabel(category)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        )}
        {fab && tags.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <TagIcon />
                <span className="flex-1 truncate">
                  {tagFilters.length > 0 ? tagFilters.join(", ") : "Tag"}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 min-w-48">
                <DropdownMenuCheckboxItem
                  checked={tagFilters.length === 0}
                  onCheckedChange={clearTags}
                >
                  All tags
                </DropdownMenuCheckboxItem>
                {tags.map(({ tag, count }) => (
                  <DropdownMenuCheckboxItem
                    key={tag}
                    checked={tagFilters.includes(tag)}
                    onCheckedChange={() => toggleTag(tag)}
                  >
                    <span className="min-w-0 flex-1 truncate">{tag}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
