import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

type FilterTileProps = Omit<ComponentProps<"button">, "children"> & {
  icon: LucideIcon;
  label: string;
  count: number;
  /** Styling only: the caller sets `aria-pressed`. */
  active?: boolean;
};

/** One choice in a grid of filters: icon, label and how many it leaves. A 0 count is greyed, still usable. */
export function FilterTile({
  icon: Icon,
  label,
  count,
  active,
  className,
  ...props
}: FilterTileProps) {
  return (
    <button
      type="button"
      aria-label={`${label} (${count})`}
      className={cn(
        "relative flex min-h-18 flex-col items-start justify-end gap-1.5 rounded-2xl border border-foreground/10 p-3 text-left font-medium text-sm outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-4 focus-visible:ring-ring/25 dark:border-white/10",
        count === 0 && "text-muted-foreground/70",
        active &&
          "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 dark:border-ring/50 dark:bg-primary/20 dark:text-ring",
        className,
      )}
      {...props}
    >
      <Icon aria-hidden className="size-4.5" />
      <span className="w-full truncate">{label}</span>
      <span
        aria-hidden
        className={cn(
          "absolute top-2.5 right-3 text-xs tabular-nums",
          active ? "font-semibold" : "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}
