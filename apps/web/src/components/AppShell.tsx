import { ScrollArea } from "@repo/ui/components/ScrollArea";
import { useFlatGround } from "@repo/ui/hooks/use-flat-ground";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

type AppShellProps = {
  /** None: the main area fills the viewport, its columns carrying the controls. */
  header?: ReactNode;
  /** Laid out by the caller, usually as `ShellPanel`s in a grid. */
  children: ReactNode;
  mainClassName?: string;
};

/**
 * Signed-in frame on the flat ground: an optional floating header panel and a
 * main area that fills the rest of the viewport. Phones drop the panels, use
 * the whole screen with a plain header row pinned over the content, and
 * scroll the document (see `MobileVault` for why).
 */
export function AppShell({ header, children, mainClassName }: AppShellProps) {
  useFlatGround();

  return (
    <div
      className={cn(
        "relative isolate flex min-h-dvh flex-col sm:h-dvh",
        header ? "sm:gap-4 sm:p-5" : "sm:p-0",
      )}
    >
      {header && (
        <header className="max-sm:sticky-bar max-sm:sticky-bar-edge sm:glass relative flex min-w-0 shrink-0 items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 max-sm:z-20 sm:h-16 sm:gap-3 sm:rounded-[20px] sm:py-0">
          {header}
        </header>
      )}
      <main
        className={cn(
          "relative grid min-h-0 flex-1 max-sm:pb-[env(safe-area-inset-bottom)]",
          header ? "sm:gap-4" : "sm:gap-2",
          mainClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
}

/**
 * Independently scrolling column of the shell; from `sm` up a raised panel, or
 * with `surface="ground"` a column straight on the ground. Phones scroll the
 * document instead, so there it's a plain section. Keep it
 * unpadded so a `PanelHeader` can pin edge to edge — pad the content instead.
 * Scrolls in a `ScrollArea`, whose hover-only scrollbar stays clear of the
 * rounded corners; scroll-padding and the like go in `viewportClassName`.
 */
export function ShellPanel({
  className,
  viewportClassName,
  surface = "panel",
  ...props
}: Omit<ComponentProps<typeof ScrollArea>, "className"> & {
  className?: string;
  surface?: "panel" | "ground";
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    const { children } = props;
    return <section className={className}>{children}</section>;
  }

  return (
    <ScrollArea
      render={<section />}
      className={cn(
        "min-h-0",
        surface === "panel"
          ? "sm:glass sm:rounded-[22px] sm:[--scroll-area-inset:22px]"
          : "sm:[--sticky-bar-fill:var(--color-background)]",
        className,
      )}
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
