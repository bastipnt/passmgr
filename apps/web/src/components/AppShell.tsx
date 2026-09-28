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

/** Independently scrolling column of the shell; frosted from `sm` up. */
export function ShellPanel({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "sm:glass min-h-0 overflow-y-auto overscroll-contain sm:rounded-[28px]",
        className,
      )}
      {...props}
    />
  );
}
