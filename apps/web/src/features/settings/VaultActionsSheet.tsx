import { itemCount, type VaultInfo } from "@repo/client";
import { ResponsiveSheet, SheetDrawerHeader } from "@repo/ui/complex-components/ResponsiveSheet";
import { ListRow, ListRowIcon } from "@repo/ui/components/ListRow";
import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { useRef } from "react";
import { VaultTile } from "@/features/vaults";

export type VaultAction = {
  key: string;
  label: string;
  /** The desktop button's name, when the label alone is ambiguous in the list ("Members of Family"). */
  ariaLabel?: string;
  description?: string;
  icon: LucideIcon;
  destructive?: boolean;
  disabled?: boolean;
  run: () => void;
};

type VaultActionsSheetProps = {
  vault: VaultInfo;
  count: number;
  actions: readonly VaultAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The phone's vault detail: Members, Edit, Rotate key, Delete. An action runs
 * once the sheet has closed, so its dialog doesn't open under the sheet.
 */
export function VaultActionsSheet({
  vault,
  count,
  actions,
  open,
  onOpenChange,
}: VaultActionsSheetProps) {
  const pending = useRef<VaultAction>(undefined);

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) return;
        const action = pending.current;
        pending.current = undefined;
        action?.run();
      }}
      title={vault.name}
      actions={<SheetDrawerHeader title={vault.name} />}
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-3 px-3 pb-2">
          <VaultTile vault={vault} />
          <span className="text-muted-foreground text-sm">{itemCount(count)}</span>
        </div>
        {actions.map((action) => (
          <ListRow
            key={action.key}
            media={
              <ListRowIcon>
                <action.icon className={cn(action.destructive && "text-destructive")} />
              </ListRowIcon>
            }
            title={
              <span className={cn(action.destructive && "text-destructive")}>{action.label}</span>
            }
            description={action.description}
            disabled={action.disabled}
            onClick={() => {
              pending.current = action;
              onOpenChange(false);
            }}
          />
        ))}
      </div>
    </ResponsiveSheet>
  );
}
