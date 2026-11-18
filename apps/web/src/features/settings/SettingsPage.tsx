import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import { createContext, type ReactNode, use } from "react";
import { useLocation } from "wouter";

const GroupHeadingContext = createContext<"h2" | "h3">("h3");

/** The heading tag of a `SettingsGroup` label: one level under its page's title. */
export function useGroupHeading() {
  return use(GroupHeadingContext);
}

type SettingsPageProps = {
  title: string;
  description?: ReactNode;
  /** Page-wide action next to the title ("New vault", "Empty trash"). */
  action?: ReactNode;
  /** Under the title, part of the header (a filter and sort row). */
  toolbar?: ReactNode;
  /** The header stays put while the page scrolls, the content fading out under it. */
  stickyHeader?: boolean;
  children: ReactNode;
  className?: string;
};

/** One settings section: display title, one-sentence description, then its `SettingsGroup`s. */
export function SettingsPage({
  title,
  description,
  action,
  toolbar,
  stickyHeader = false,
  children,
  className,
}: SettingsPageProps) {
  const isMobile = useIsMobile();
  const [path] = useLocation();
  // On a phone the page is the whole screen; on desktop the overlay's "Settings" is the h1.
  const Title = isMobile ? "h1" : "h2";

  return (
    <GroupHeadingContext value={isMobile ? "h2" : "h3"}>
      <div
        data-settings-page={path}
        className={cn(
          "flex max-w-218 flex-col gap-8 px-14 py-10 max-sm:gap-7 max-sm:px-6 max-sm:pt-3 max-sm:pb-12",
          className,
        )}
      >
        <header
          className={cn(
            "flex flex-col gap-6 max-sm:gap-4",
            // Covers the page's top padding while stuck; on a phone it sticks under the AppShell bar.
            stickyHeader &&
              "sticky top-0 z-10 -mt-10 bg-background pt-10 pb-4 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-8 after:bg-linear-to-b after:from-background after:to-transparent max-sm:top-(--page-bar-h,0px) max-sm:-mt-3 max-sm:pt-3",
          )}
        >
          <div className="flex items-start gap-4 max-sm:px-1">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Title className="font-bold font-display text-[30px] leading-9">{title}</Title>
              {description && <p className="text-muted-foreground text-sm">{description}</p>}
            </div>
            {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
          </div>
          {toolbar}
        </header>
        {children}
      </div>
    </GroupHeadingContext>
  );
}
