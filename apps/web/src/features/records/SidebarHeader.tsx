import { Button } from "@repo/ui/components/Button";
import Link from "@repo/ui/components/Link";
import { cn } from "@repo/ui/lib/utils";
import { PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon } from "lucide-react";
import { VaultSwitcher } from "@/features/vaults";
import { createSheetSearch } from "./CreateRecordSheet";

type SidebarHeaderProps = {
  collapsed: boolean;
  /** No toggle without it. */
  onCollapsedChange?: (collapsed: boolean) => void;
  controlsId: string;
};

export function SidebarHeader({ collapsed, onCollapsedChange, controlsId }: SidebarHeaderProps) {
  const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;

  return (
    <div className={cn("flex items-center gap-1 pb-2", collapsed && "flex-col")}>
      <VaultSwitcher variant="scope" collapsed={collapsed} className={cn(!collapsed && "flex-1")} />
      {onCollapsedChange && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sidebar"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          aria-controls={controlsId}
          onClick={() => onCollapsedChange(!collapsed)}
          // A disclosure, not a menu: no open-menu fill while expanded.
          className="text-muted-foreground hover:bg-foreground/5 aria-expanded:bg-transparent"
        >
          <ToggleIcon />
        </Button>
      )}
      <Link
        variant="default"
        size="icon"
        href={createSheetSearch()}
        aria-label="New record"
        title="New record"
      >
        <PlusIcon />
      </Link>
    </div>
  );
}
