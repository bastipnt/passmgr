import {
  type CategoryFilter,
  categoryLabel,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import { RECORD_TYPES } from "@repo/schema";
import { SidebarItem } from "@repo/ui/components/SidebarItem";
import { LayoutListIcon, type LucideIcon, StarIcon } from "lucide-react";
import { useId } from "react";
import { RECORD_TYPE_ICONS } from "./RecordAvatar";

const CATEGORY_ICONS: Record<CategoryFilter, LucideIcon> = {
  all: LayoutListIcon,
  favorites: StarIcon,
  ...RECORD_TYPE_ICONS,
};

export function CategorySidebar() {
  const { categoryFilter, setCategoryFilter, categoryCounts } = useSortedRecords();
  const titleId = useId();

  const item = (category: CategoryFilter) => (
    <li key={category}>
      <SidebarItem
        icon={CATEGORY_ICONS[category]}
        label={categoryLabel(category)}
        count={categoryCounts[category]}
        active={category === categoryFilter}
        aria-pressed={category === categoryFilter}
        dimmed={categoryCounts[category] === 0}
        onClick={() => setCategoryFilter(category)}
      />
    </li>
  );

  return (
    <nav aria-labelledby={titleId} className="flex flex-col gap-2 p-3">
      <h2
        id={titleId}
        className="flex h-8 items-center px-2.5 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]"
      >
        Categories
      </h2>
      <ul className="flex flex-col gap-0.5">{(["all", "favorites"] as const).map(item)}</ul>
      <hr className="mx-2.5 border-foreground/10 dark:border-white/10" />
      <ul className="flex flex-col gap-0.5">{RECORD_TYPES.map(item)}</ul>
    </nav>
  );
}
