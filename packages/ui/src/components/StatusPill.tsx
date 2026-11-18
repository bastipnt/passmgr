import type { StatusTone } from "@repo/ui/lib/tone";
import { cn } from "@repo/ui/lib/utils";
import type { ComponentProps } from "react";

const dotClassName: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  neutral: "bg-muted-foreground",
};

/** A dot and a word ("Synced", "Never backed up"). The word carries the meaning; the dot only echoes it. */
export function StatusPill({
  tone,
  className,
  children,
  ...props
}: ComponentProps<"span"> & { tone: StatusTone }) {
  return (
    <span
      data-slot="status-pill"
      data-tone={tone}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2.5 py-0.75 font-medium text-foreground text-xs",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dotClassName[tone])} />
      {children}
    </span>
  );
}
