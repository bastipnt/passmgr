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
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import { cn } from "@repo/ui/lib/utils";
import { ArrowUpDownIcon } from "lucide-react";

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All items" },
  ...RECORD_TYPES.map((type) => ({ value: type, label: RECORD_TYPE_LABELS[type].plural })),
];

type RecordSortMenuProps = {
  /** `fab`: a round icon button for the phone's bottom dock, opening upward. */
  variant?: "inline" | "fab";
};

/** Sort order and the type filter, in one menu: both decide what the list shows. */
export function RecordSortMenu({ variant = "inline" }: RecordSortMenuProps) {
  const { sort, handleSortChange, typeFilter, setTypeFilter } = useSortedRecords();
  const fab = variant === "fab";
  const filtered = typeFilter !== "all";
  const accessibleName = `Sort: ${SORT_LABELS[sort]}${filtered ? `, showing ${RECORD_TYPE_LABELS[typeFilter].plural}` : ""}`;

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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
