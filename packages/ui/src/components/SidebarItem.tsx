import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { CountBadge } from "@repo/ui/components/CountBadge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/Tooltip";
import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type SidebarItemProps = Omit<useRender.ComponentProps<"button">, "children"> & {
  icon: LucideIcon;
  label: string;
  count?: number;
  /**
   * `warning`: something to act on (an amber badge; collapsed, an amber dot).
   * `primary`: what's on (an accent badge, also collapsed). `plain`: a tally, in the tooltip when collapsed.
   */
  countTone?: "plain" | "warning" | "primary";
  /** Styling only: the caller sets `aria-pressed` / `aria-current`. */
  active?: boolean;
  /** Nothing behind it (an empty category): greyed, still usable. */
  dimmed?: boolean;
  /** Icon only, with the label and count in a tooltip. */
  collapsed?: boolean;
  /** After the count, hidden when collapsed. */
  trailing?: ReactNode;
};

export function SidebarItem({
  icon: Icon,
  label,
  count,
  countTone = "plain",
  active,
  dimmed,
  collapsed,
  trailing,
  className,
  render,
  ...props
}: SidebarItemProps) {
  const name = props["aria-label"] ?? (count === undefined ? label : `${label} (${count})`);

  const item = useRender({
    defaultTagName: "button",
    render,
    props: mergeProps<"button">(
      {
        type: render ? undefined : "button",
        "aria-label": count === undefined ? undefined : name,
        className: cn(
          "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-left font-medium text-sm outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-4 focus-visible:ring-ring/25 [&_svg]:size-4 [&_svg]:shrink-0",
          collapsed && "relative size-9 justify-center px-0",
          dimmed && "text-muted-foreground/70",
          // Neutral: the accent marks the selection one level down (the list).
          active && "bg-foreground/6 font-semibold hover:bg-foreground/8 dark:bg-white/8",
          className,
        ),
        children: (
          <>
            <Icon aria-hidden />
            <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>{label}</span>
            {count !== undefined &&
              countTone !== "plain" &&
              (collapsed && countTone === "warning" ? (
                <span
                  aria-hidden
                  className="absolute top-1.5 right-1.5 size-2 rounded-full bg-warning"
                />
              ) : (
                <CountBadge
                  count={count}
                  tone={countTone}
                  placement={collapsed ? "corner" : "inline"}
                  className={cn(dimmed && "opacity-70")}
                />
              ))}
            {count !== undefined && countTone === "plain" && !collapsed && (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  active ? "font-semibold" : "text-muted-foreground",
                  dimmed && "opacity-70",
                )}
              >
                {count}
              </span>
            )}
            {!collapsed && trailing}
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
