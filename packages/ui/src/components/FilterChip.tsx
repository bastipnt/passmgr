import { cn } from "@repo/ui/lib/utils";
import { XIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

type FilterChipProps = Omit<ComponentProps<"button">, "children" | "aria-label"> & {
  label: string;
  /** Before the label: an icon, or `#` for a tag. */
  icon?: ReactNode;
  /** The accessible name, e.g. "Remove tag work". */
  removeLabel: string;
};

export function FilterChip({ label, icon, removeLabel, className, ...props }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-label={removeLabel}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 pr-2 pl-3 font-medium text-[0.84rem] text-primary-text outline-none transition-colors hover:bg-primary/15 focus-visible:ring-4 focus-visible:ring-ring/25 dark:border-ring/25 dark:bg-primary/20 [&_svg]:size-3.5 [&_svg]:shrink-0",
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
