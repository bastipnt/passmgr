import {
  activeFilterCount,
  CATEGORIES,
  type CategoryFilter,
  categoryLabel,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import { Button } from "@repo/ui/components/Button";
import { CountBadge } from "@repo/ui/components/CountBadge";
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
import { ListFilterIcon, TagIcon } from "lucide-react";

export function RecordFilterMenu() {
  const {
    query,
    categoryFilter,
    setCategoryFilter,
    categoryCounts,
    tagFilters,
    toggleTag,
    clearTags,
    tags,
  } = useSortedRecords();
  // A search ignores category and tags.
  const active = query.trim() ? 0 : activeFilterCount(categoryFilter, tagFilters);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="floating"
            size="fab"
            aria-label={active > 0 ? `Filter (${active} on)` : "Filter"}
            className="relative"
          >
            <ListFilterIcon className="size-5" />
            {active > 0 && <CountBadge count={active} tone="primary" className="top-0 right-0" />}
          </Button>
        }
      />
      <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-auto min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={categoryFilter}
            onValueChange={(value) => setCategoryFilter(value as CategoryFilter)}
          >
            {CATEGORIES.map((category) => (
              <DropdownMenuRadioItem key={category} value={category}>
                <span className="flex-1">{categoryLabel(category)}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {categoryCounts[category]}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {tags.length > 0 && (
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
