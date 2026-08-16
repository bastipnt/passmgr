import { SORT_LABELS, type SortOption, useSortedRecords } from "@repo/client";
import { MenuSelect } from "@repo/ui-native";
import { ArrowUpDownIcon } from "lucide-react-native";
import { useCSSVariable } from "uniwind";

const SORT_OPTIONS = (Object.entries(SORT_LABELS) as [SortOption, string][]).map(
  ([value, label]) => ({ value, label }),
);

/** Sort picker for the records list — mirrors the web sidebar's sort dropdown. */
export function RecordsSortMenu() {
  const { sort, handleSortChange } = useSortedRecords();
  const iconColor = useCSSVariable("--color-foreground") as string;

  return (
    <MenuSelect
      title="Sort by"
      value={sort}
      options={SORT_OPTIONS}
      onChange={handleSortChange}
      systemImage="arrow.up.arrow.down"
      icon={<ArrowUpDownIcon size={20} color={iconColor} />}
      accessibilityLabel="Sort records"
    />
  );
}
