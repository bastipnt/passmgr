import { useShortcut } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { cn } from "@repo/ui/lib/utils";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SHORTCUTS } from "@/lib/shortcuts";

// Esc belongs to these while one has focus (they close themselves, or clear), not to the overlay.
const OWNS_ESCAPE =
  'dialog, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], input, textarea, select';

type OverlayHeaderProps = {
  title: string;
  icon?: ReactNode;
  titleClassName?: string;
  /** After the title (a search field, a status line). */
  children?: ReactNode;
  /** Before the Esc hint. */
  actions?: ReactNode;
  closeLabel: string;
  onClose: () => void;
};

/** The bar of a desktop full-screen overlay: its title, and Esc / a close button. */
export function OverlayHeader({
  title,
  icon,
  titleClassName,
  children,
  actions,
  closeLabel,
  onClose,
}: OverlayHeaderProps) {
  // The default stays: a native dialog closes on the same Esc.
  useShortcut(
    SHORTCUTS.closeSettings.key,
    (event) => {
      if (event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest(OWNS_ESCAPE)) return;
      onClose();
    },
    { preventDefault: false },
  );

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-border border-b bg-card px-6">
      {icon}
      <h1 className={cn("shrink-0 font-display font-semibold text-xl", titleClassName)}>{title}</h1>
      {children}
      <div className="ml-auto flex items-center gap-4">
        {actions}
        <span aria-hidden="true" className="text-muted-foreground text-xs">
          Esc
        </span>
        <Button variant="outline" size="icon-lg" aria-label={closeLabel} onClick={onClose}>
          <XIcon />
        </Button>
      </div>
    </header>
  );
}
