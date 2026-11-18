import { ResponsiveSheet, SheetDrawerHeader } from "@repo/ui/complex-components/ResponsiveSheet";
import { ListRow, ListRowIcon } from "@repo/ui/components/ListRow";
import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useRef } from "react";

export type SettingsAction = {
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

type SettingsActionsSheetProps = {
  title: string;
  /** What the actions are for, above them (a vault's tile and item count). */
  summary?: ReactNode;
  actions: readonly SettingsAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * A phone row's actions (a vault's Members, Edit, Rotate key, Delete; a tag's
 * Rename, Remove). An action runs once the sheet has closed, so its dialog
 * doesn't open under the sheet.
 */
export function SettingsActionsSheet({
  title,
  summary,
  actions,
  open,
  onOpenChange,
}: SettingsActionsSheetProps) {
  const pending = useRef<SettingsAction>(undefined);

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
      title={title}
      actions={<SheetDrawerHeader title={title} />}
    >
      <div className="flex flex-col">
        {summary && <div className="flex items-center gap-3 px-3 pb-2">{summary}</div>}
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
