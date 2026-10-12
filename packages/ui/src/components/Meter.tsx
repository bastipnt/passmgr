import { cn } from "@repo/ui/lib/utils";
import type * as React from "react";

type MeterProps = Omit<React.ComponentProps<"div">, "children"> & {
  value: number;
  max?: number;
  /** Fill colour, e.g. `bg-success`. */
  indicatorClassName?: string;
};

/** A thin bar filled to `value` of `max`; give it an `aria-label`. */
function Meter({ value, max = 100, className, indicatorClassName, ...props }: MeterProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      data-slot="meter"
      // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- <meter>'s bar is styled per engine (-webkit-/-moz- pseudos)
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-1.5 overflow-hidden rounded-full bg-foreground/10", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full bg-primary", indicatorClassName)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export { Meter };
