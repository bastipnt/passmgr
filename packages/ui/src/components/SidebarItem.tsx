import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@repo/ui/lib/utils";
import type { LucideIcon } from "lucide-react";

type SidebarItemProps = Omit<useRender.ComponentProps<"button">, "children"> & {
  icon: LucideIcon;
  label: string;
  count?: number;
  /** Styling only: the caller sets `aria-pressed` / `aria-current`. */
  active?: boolean;
  /** Nothing behind it (an empty category): greyed, still usable. */
  dimmed?: boolean;
};

export function SidebarItem({
  icon: Icon,
  label,
  count,
  active,
  dimmed,
  className,
  render,
  ...props
}: SidebarItemProps) {
  return useRender({
    defaultTagName: "button",
    render,
    props: mergeProps<"button">(
      {
        type: render ? undefined : "button",
        "aria-label": count === undefined ? undefined : `${label} (${count})`,
        className: cn(
          "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-left font-medium text-sm outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-4 focus-visible:ring-ring/25 [&_svg]:size-4 [&_svg]:shrink-0",
          dimmed && "text-muted-foreground/70",
          active &&
            "bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/20 dark:text-ring",
          className,
        ),
        children: (
          <>
            <Icon aria-hidden />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {count !== undefined && (
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
          </>
        ),
      },
      props,
    ),
  });
}
