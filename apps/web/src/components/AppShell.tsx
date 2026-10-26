import { ScrollArea } from "@repo/ui/components/ScrollArea";
import { useFlatGround } from "@repo/ui/hooks/use-flat-ground";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

type AppShellProps = {
  header: ReactNode;
  /** A row between the header and the main area (desktop only). */
  subheader?: ReactNode;
  /** Laid out by the caller, usually as `ShellPanel`s in a grid. */
  children: ReactNode;
  mainClassName?: string;
};

/**
 * Signed-in frame on the flat ground: a floating header panel and a main area
 * that fills the rest of the viewport. Phones drop the panels, use
 * the whole screen with a plain header row pinned over the content, and
 * scroll the document (see `MobileVault` for why).
 */
export function AppShell({ header, subheader, children, mainClassName }: AppShellProps) {
  useFlatGround();

  return (
    <div className="relative isolate flex min-h-dvh flex-col sm:h-dvh sm:gap-4 sm:p-5">
      <header className="max-sm:sticky-bar max-sm:sticky-bar-edge sm:glass relative flex min-w-0 shrink-0 items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 max-sm:z-20 sm:h-16 sm:gap-3 sm:rounded-[20px] sm:py-0">
        {header}
      </header>
      {subheader && <div className="shrink-0 empty:hidden max-sm:hidden">{subheader}</div>}
      <main
        className={cn(
          "relative grid min-h-0 flex-1 max-sm:pb-[env(safe-area-inset-bottom)] sm:gap-4",
          mainClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
}

/**
 * Independently scrolling column of the shell; a panel from `sm` up. Phones
 * scroll the document instead, so there it's a plain section. Keep it
 * unpadded so a `PanelHeader` can pin edge to edge — pad the content instead.
 * Scrolls in a `ScrollArea`, whose hover-only scrollbar stays clear of the
 * rounded corners; scroll-padding and the like go in `viewportClassName`.
 */
export function ShellPanel({
  className,
  viewportClassName,
  ...props
}: Omit<ComponentProps<typeof ScrollArea>, "className"> & { className?: string }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    const { children } = props;
    return <section className={className}>{children}</section>;
  }

  return (
    <ScrollArea
      render={<section />}
      className={cn("sm:glass min-h-0 sm:rounded-[28px] sm:[--scroll-area-inset:28px]", className)}
      viewportClassName={cn("isolate overscroll-contain", viewportClassName)}
      {...props}
    />
  );
}

/**
 * Heading bar pinned to the top of a `ShellPanel`, content frosted beneath.
 * On phones it scrolls away under the shell's pinned header instead.
 */
export function PanelHeader({ className, ...props }: ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "sticky-bar flex min-h-14 items-center gap-2 px-4 pt-3 pb-2 max-sm:relative max-sm:before:hidden",
        className,
      )}
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
