import {
  type CategoryFilter,
  categoryLabel,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import { RECORD_TYPES } from "@repo/schema";
import { SidebarDivider, SidebarItem } from "@repo/ui/components/SidebarItem";
import { cn } from "@repo/ui/lib/utils";
import { LayoutListIcon, type LucideIcon, StarIcon } from "lucide-react";
import { RECORD_TYPE_ICONS } from "./RecordAvatar";

export const CATEGORY_ICONS: Record<CategoryFilter, LucideIcon> = {
  all: LayoutListIcon,
  favorites: StarIcon,
  ...RECORD_TYPE_ICONS,
};

export function CategorySidebar({ collapsed }: { collapsed: boolean }) {
  const { categoryFilter, setCategoryFilter, categoryCounts } = useSortedRecords();

  const item = (category: CategoryFilter) => (
    <li key={category}>
      <SidebarItem
        icon={CATEGORY_ICONS[category]}
        label={categoryLabel(category)}
        count={categoryCounts[category]}
        active={category === categoryFilter}
        aria-pressed={category === categoryFilter}
        dimmed={categoryCounts[category] === 0}
        collapsed={collapsed}
        onClick={() => setCategoryFilter(category)}
      />
    </li>
  );

  return (
    <nav
      aria-label="Categories"
      className={cn("flex flex-col gap-0.5", collapsed && "items-center")}
    >
      <ul className="flex flex-col gap-0.5">{(["all", "favorites"] as const).map(item)}</ul>
      {collapsed ? (
        <div className="py-1.5">
          <SidebarDivider collapsed />
        </div>
      ) : (
        <h2 className="px-2.5 pt-3 pb-1 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
          Categories
        </h2>
      )}
      <ul className="flex flex-col gap-0.5">{RECORD_TYPES.map(item)}</ul>
    </nav>
  );
}
