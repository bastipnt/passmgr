import { cn } from "@repo/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

type AppShellProps = {
  header: ReactNode;
  /** Laid out by the caller, usually as `ShellPanel`s in a grid. */
  children: ReactNode;
  mainClassName?: string;
};

/**
 * Signed-in frame: a dimmed light field, a floating glass header bar and a
 * main area that fills the rest of the viewport. Phones drop the glass and
 * use the whole screen: solid ground, a top glow and a plain header row.
 */
export function AppShell({ header, children, mainClassName }: AppShellProps) {
  return (
    <div className="relative isolate grid h-dvh grid-rows-[auto_minmax(0,1fr)] sm:gap-4 sm:p-5">
      <div className="light-field [--field-opacity:0.28] max-sm:hidden" />
      <div className="top-glow sm:hidden" aria-hidden />
      <header className="sm:glass relative flex min-w-0 items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 sm:h-16 sm:gap-3 sm:rounded-[20px] sm:py-0">
        {header}
      </header>
      <main className={cn("relative grid min-h-0 sm:gap-4", mainClassName)}>{children}</main>
    </div>
  );
}

/**
 * Independently scrolling column of the shell; glass from `sm` up. Keep it
 * unpadded so a `PanelHeader` can pin edge to edge — pad the content instead.
 * No backdrop blur of its own: with one, Chrome's sticky bars inside blur
 * nothing — and the light field behind is blurred already. Sticky bars inside
 * tint with the glass fill, not the page background (too dark over glass) —
 * in dark mode not at all, where even the faint glass fill reads as a strip.
 */
export function ShellPanel({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "sm:glass sm:backdrop-filter-none! isolate min-h-0 overflow-y-auto overscroll-contain sm:rounded-[28px] sm:[--sticky-bar-fill:var(--glass-fill)] sm:dark:[--sticky-bar-fill:transparent]",
        className,
      )}
      {...props}
    />
  );
}

/** Heading bar pinned to the top of a `ShellPanel`, content frosted beneath. */
export function PanelHeader({ className, ...props }: ComponentProps<"header">) {
  return (
    <header
      className={cn("sticky-bar flex min-h-14 items-center gap-2 px-4 pt-3 pb-2", className)}
      {...props}
    />
  );
}

export function PanelTitle({ className, children, ...props }: ComponentProps<"h2">) {
  return (
    <h2 className={cn("font-bold font-display text-lg tracking-[-0.02em]", className)} {...props}>
      {children}
    </h2>
  );
}
