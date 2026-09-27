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
 * main area that fills the rest of the viewport.
 */
export function AppShell({ header, children, mainClassName }: AppShellProps) {
  return (
    <div className="relative isolate grid h-dvh grid-rows-[auto_minmax(0,1fr)] gap-3 p-3 sm:gap-4 sm:p-5">
      <div className="light-field [--field-opacity:0.28]" />
      <header className="glass flex h-16 min-w-0 items-center gap-2 rounded-[20px] px-3 sm:gap-3 sm:px-4">
        {header}
      </header>
      <main className={cn("grid min-h-0 gap-3 sm:gap-4", mainClassName)}>{children}</main>
    </div>
  );
}

/** Frosted, independently scrolling column of the shell. */
export function ShellPanel({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("glass min-h-0 overflow-y-auto overscroll-contain rounded-[28px]", className)}
      {...props}
    />
  );
}
