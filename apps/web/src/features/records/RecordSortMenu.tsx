import { RECORD_TYPE_LABELS } from "@repo/client";
import type { SortOption, TypeFilter } from "@repo/client/src/providers/SortedRecordsProvider";
import { SORT_LABELS, useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import { RECORD_TYPES } from "@repo/schema";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
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

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All items" },
  ...RECORD_TYPES.map((type) => ({ value: type, label: RECORD_TYPE_LABELS[type].plural })),
];

type RecordSortMenuProps = {
  /** `fab`: a round icon button for the phone's bottom dock, opening upward. */
  variant?: "inline" | "fab";
};

// No tag is ever empty, so "" stands for every record in the radio group.
const ALL_TAGS = "";

/** Sort order and the type and tag filters, in one menu: they decide what the list shows. */
export function RecordSortMenu({ variant = "inline" }: RecordSortMenuProps) {
  const { sort, handleSortChange, typeFilter, setTypeFilter, tagFilter, setTagFilter, tags } =
    useSortedRecords();
  const fab = variant === "fab";
  const filtered = typeFilter !== "all" || tagFilter !== null;
  const showing = [
    typeFilter === "all" ? undefined : RECORD_TYPE_LABELS[typeFilter].plural,
    tagFilter === null ? undefined : `tagged ${tagFilter}`,
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
              // A dot on the button: the list is narrowed to one type.
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
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={typeFilter}
            onValueChange={(value) => setTypeFilter(value as TypeFilter)}
          >
            {TYPE_FILTERS.map(({ value, label }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {label}
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
                <span className="flex-1 truncate">{tagFilter ?? "Tag"}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 min-w-48">
                <DropdownMenuRadioGroup
                  value={tagFilter ?? ALL_TAGS}
                  onValueChange={(value) => setTagFilter(value === ALL_TAGS ? null : value)}
                >
                  <DropdownMenuRadioItem value={ALL_TAGS}>All tags</DropdownMenuRadioItem>
                  {tags.map(({ tag, count }) => (
                    <DropdownMenuRadioItem key={tag} value={tag}>
                      <span className="min-w-0 flex-1 truncate">{tag}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
