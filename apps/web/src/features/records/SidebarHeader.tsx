import { Button } from "@repo/ui/components/Button";
import Link from "@repo/ui/components/Link";
import { cn } from "@repo/ui/lib/utils";
import { PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon } from "lucide-react";
import type { Ref } from "react";
import { VaultSwitcher } from "@/features/vaults";
import { createSheetSearch } from "./CreateRecordSheet";

type SidebarToggleProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  controlsId: string;
  ref?: Ref<HTMLButtonElement>;
};

export function SidebarToggle({
  collapsed,
  onCollapsedChange,
  controlsId,
  ref,
}: SidebarToggleProps) {
  const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;

  return (
    <Button
      ref={ref}
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
  );
}

type SidebarHeaderProps = {
  collapsed: boolean;
  /** No toggle without it. */
  onCollapsedChange?: (collapsed: boolean) => void;
  controlsId: string;
  toggleRef?: Ref<HTMLButtonElement>;
};

export function SidebarHeader({
  collapsed,
  onCollapsedChange,
  controlsId,
  toggleRef,
}: SidebarHeaderProps) {
  return (
    <div className={cn("flex items-center gap-1 pb-2", collapsed && "flex-col gap-2")}>
      <VaultSwitcher variant="scope" collapsed={collapsed} className={cn(!collapsed && "flex-1")} />
      {onCollapsedChange && !collapsed && (
        <SidebarToggle
          ref={toggleRef}
          collapsed={false}
          onCollapsedChange={onCollapsedChange}
          controlsId={controlsId}
        />
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
