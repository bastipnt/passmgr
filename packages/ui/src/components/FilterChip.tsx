import { cn } from "@repo/ui/lib/utils";
import { XIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

type FilterChipProps = Omit<ComponentProps<"button">, "children" | "aria-label"> & {
  label: string;
  /** Before the label: an icon, or `#` for a tag. */
  icon?: ReactNode;
  /** The accessible name, e.g. "Remove tag work". */
  removeLabel: string;
  /** `neutral`: on a tinted tray, where an accent fill would compete with the list's selection. */
  tone?: "accent" | "neutral";
};

export function FilterChip({
  label,
  icon,
  removeLabel,
  tone = "accent",
  className,
  ...props
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-label={removeLabel}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border pr-2 pl-3 font-medium text-[0.84rem] outline-none transition-colors focus-visible:ring-4 focus-visible:ring-ring/25 [&_svg]:size-3.5 [&_svg]:shrink-0",
        tone === "accent"
          ? "border-primary/20 bg-primary/10 text-primary-text hover:bg-primary/15 dark:border-ring/25 dark:bg-primary/20"
          : "h-7 border-border bg-card text-foreground hover:bg-muted",
        className,
      )}
      {...props}
    >
      {icon && (
        <span aria-hidden className="flex items-center font-semibold opacity-80">
          {icon}
        </span>
      )}
      <span className="max-w-40 truncate">{label}</span>
      <XIcon aria-hidden strokeWidth={2.4} className="opacity-70" />
    </button>
  );
}
