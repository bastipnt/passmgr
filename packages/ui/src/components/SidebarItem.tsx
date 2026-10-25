import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/Tooltip";
import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";

type SidebarItemProps = Omit<useRender.ComponentProps<"button">, "children"> & {
  icon: LucideIcon;
  label: string;
  count?: number;
  /** `warning`: the count is something to act on (an amber badge), not a tally. */
  countTone?: "plain" | "warning";
  /** Styling only: the caller sets `aria-pressed` / `aria-current`. */
  active?: boolean;
  /** Nothing behind it (an empty category): greyed, still usable. */
  dimmed?: boolean;
  /** Icon only, with the label and count in a tooltip; a `warning` count stays as a badge. */
  collapsed?: boolean;
};

export function SidebarItem({
  icon: Icon,
  label,
  count,
  countTone = "plain",
  active,
  dimmed,
  collapsed,
  className,
  render,
  ...props
}: SidebarItemProps) {
  const name = count === undefined ? label : `${label} (${count})`;
  const warning = countTone === "warning";

  const item = useRender({
    defaultTagName: "button",
    render,
    props: mergeProps<"button">(
      {
        type: render ? undefined : "button",
        "aria-label": count === undefined ? undefined : name,
        className: cn(
          "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-left font-medium text-sm outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-4 focus-visible:ring-ring/25 [&_svg]:size-4 [&_svg]:shrink-0",
          collapsed && "relative size-10 justify-center px-0",
          dimmed && "text-muted-foreground/70",
          active &&
            "bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/20 dark:text-ring",
          className,
        ),
        children: (
          <>
            <Icon aria-hidden />
            <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>{label}</span>
            {count !== undefined && (!collapsed || warning) && (
              <span
                aria-hidden={collapsed || undefined}
                className={cn(
                  "text-xs tabular-nums",
                  warning
                    ? "grid h-5 min-w-5 place-items-center rounded-full bg-warning/20 px-1.5 font-semibold text-amber-700 dark:text-strength-strong"
                    : active
                      ? "font-semibold"
                      : "text-muted-foreground",
                  collapsed &&
                    "absolute -top-1 -right-1 h-4 min-w-4 bg-warning px-1 text-[0.625rem] text-amber-950 dark:text-amber-950",
                  dimmed && "opacity-70",
                )}
              >
                {count}
              </span>
            )}
          </>
        ),
      },
      props,
    ),
  });

  if (!collapsed) return item;
  return (
    <Tooltip>
      <TooltipTrigger render={item} />
      <TooltipContent side="right">{name}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarDivider({ collapsed }: { collapsed?: boolean }) {
  return (
    <hr
      className={cn(
        "border-foreground/10 dark:border-white/10",
        collapsed ? "w-6 self-center" : "mx-2.5",
      )}
    />
  );
}
