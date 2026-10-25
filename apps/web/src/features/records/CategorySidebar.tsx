import {
  type CategoryFilter,
  categoryLabel,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import { RECORD_TYPES } from "@repo/schema";
import { Button } from "@repo/ui/components/Button";
import { SidebarDivider, SidebarItem } from "@repo/ui/components/SidebarItem";
import { cn } from "@repo/ui/lib/utils";
import {
  LayoutListIcon,
  type LucideIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  StarIcon,
} from "lucide-react";
import { useId } from "react";
import { RECORD_TYPE_ICONS } from "./RecordAvatar";

const CATEGORY_ICONS: Record<CategoryFilter, LucideIcon> = {
  all: LayoutListIcon,
  favorites: StarIcon,
  ...RECORD_TYPE_ICONS,
};

type CategorySidebarProps = {
  collapsed: boolean;
  /** No toggle without it. */
  onCollapsedChange?: (collapsed: boolean) => void;
  controlsId: string;
};

export function CategorySidebar({
  collapsed,
  onCollapsedChange,
  controlsId,
}: CategorySidebarProps) {
  const { categoryFilter, setCategoryFilter, categoryCounts } = useSortedRecords();
  const titleId = useId();
  const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;

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
      aria-labelledby={titleId}
      className={cn("flex flex-col gap-2 p-3", collapsed && "items-center")}
    >
      <div className={cn("flex h-8 items-center", !collapsed && "justify-between pl-2.5")}>
        <h2
          id={titleId}
          className={cn(
            "font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]",
            collapsed && "sr-only",
          )}
        >
          Categories
        </h2>
        {onCollapsedChange && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Sidebar"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls={controlsId}
            onClick={() => onCollapsedChange(!collapsed)}
            className="text-muted-foreground"
          >
            <ToggleIcon />
          </Button>
        )}
      </div>
      <ul className="flex flex-col gap-0.5">{(["all", "favorites"] as const).map(item)}</ul>
      <SidebarDivider collapsed={collapsed} />
      <ul className="flex flex-col gap-0.5">{RECORD_TYPES.map(item)}</ul>
    </nav>
  );
}
