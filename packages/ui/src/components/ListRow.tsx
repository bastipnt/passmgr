import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

type ListRowProps = Omit<useRender.ComponentProps<"button">, "children" | "title"> & {
  /** The leading tile or avatar. */
  media: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** After the text: a badge, a checkmark, a chevron. */
  trailing?: ReactNode;
  /** Styling only: the caller sets `aria-pressed` / `aria-current`. */
  active?: boolean;
};

/** A full-width row of a sheet's list: media, a title over a description, something trailing. */
export function ListRow({
  media,
  title,
  description,
  trailing,
  active,
  className,
  render,
  ...props
}: ListRowProps) {
  return useRender({
    defaultTagName: "button",
    render,
    props: mergeProps<"button">(
      {
        type: render ? undefined : "button",
        className: cn(
          "flex min-h-15 w-full items-center gap-3 px-4 py-2 text-left outline-none transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 disabled:pointer-events-none disabled:opacity-50 sm:px-5",
          active && "bg-primary/8 hover:bg-primary/12 dark:bg-primary/15",
          className,
        ),
        children: (
          <>
            {media}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-[0.9375rem]">{title}</span>
              {description && (
                <span className="truncate text-muted-foreground text-xs">{description}</span>
              )}
            </span>
            {trailing}
          </>
        ),
      },
      props,
    ),
  });
}

/** A `ListRow`'s icon on a soft square, for rows without a tile of their own. */
export function ListRowIcon({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-foreground/10 text-muted-foreground dark:border-white/10 [&_svg]:size-4.5"
    >
      {children}
    </span>
  );
}
