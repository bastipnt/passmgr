import type { SortOption } from "@repo/client/src/providers/SortedRecordsProvider";
import { SORT_LABELS, useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import { ArrowUpDownIcon } from "lucide-react";

type RecordSortMenuProps = {
  /** `fab`: a round icon button for the phone's bottom dock, opening upward. */
  variant?: "inline" | "fab";
};

export function RecordSortMenu({ variant = "inline" }: RecordSortMenuProps) {
  const { sort, handleSortChange } = useSortedRecords();
  const fab = variant === "fab";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          fab ? (
            <Button variant="floating" size="fab" aria-label={`Sort: ${SORT_LABELS[sort]}`}>
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
        <DropdownMenuRadioGroup value={sort} onValueChange={handleSortChange}>
          {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([value, label]) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
