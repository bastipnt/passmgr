import { cn } from "@repo/ui/lib/utils";

type CountBadgeProps = {
  count: number;
  /** `warning`: something to act on (amber); `primary`: a tally of what's on. */
  tone?: "warning" | "primary";
  /** `corner`: pinned to the top-right of a `relative` icon button; `inline`: in a row of text. */
  placement?: "corner" | "inline";
  className?: string;
};

/** Decorative: the control it sits on names the count. */
export function CountBadge({
  count,
  tone = "warning",
  placement = "corner",
  className,
}: CountBadgeProps) {
  const corner = placement === "corner";
  return (
    <span
      aria-hidden
      className={cn(
        "grid place-items-center rounded-full font-semibold tabular-nums",
        corner
          ? "absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[0.625rem] leading-none"
          : "h-5 min-w-5 px-1.5 text-xs",
        tone === "primary"
          ? "bg-primary text-primary-foreground"
          : corner
            ? "bg-warning text-amber-950"
            : "bg-warning/20 text-amber-700 dark:text-strength-strong",
        className,
      )}
    >
      {count}
    </span>
  );
}
