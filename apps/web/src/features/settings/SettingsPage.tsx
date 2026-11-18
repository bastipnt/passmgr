import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import { createContext, type ReactNode, use } from "react";

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
  children: ReactNode;
  className?: string;
};

/** One settings section: display title, one-sentence description, then its `SettingsGroup`s. */
export function SettingsPage({
  title,
  description,
  action,
  children,
  className,
}: SettingsPageProps) {
  const isMobile = useIsMobile();
  // On a phone the page is the whole screen; on desktop the overlay's "Settings" is the h1.
  const Title = isMobile ? "h1" : "h2";

  return (
    <GroupHeadingContext value={isMobile ? "h2" : "h3"}>
      <div
        className={cn(
          "flex max-w-190 flex-col gap-8 px-14 py-10 max-sm:gap-7 max-sm:px-6 max-sm:pt-3 max-sm:pb-12",
          className,
        )}
      >
        <header className="flex items-start gap-4 max-sm:px-1">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Title className="font-bold font-display text-[30px] leading-9">{title}</Title>
            {description && <p className="text-muted-foreground text-sm">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
        {children}
      </div>
    </GroupHeadingContext>
  );
}
