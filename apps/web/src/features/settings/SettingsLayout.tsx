import { ThemeToggle } from "@repo/ui/complex-components/ThemeToggle";
import Link from "@repo/ui/components/Link";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useRoute } from "wouter";
import { recordPaths, settingsPaths } from "@/app/route-paths";
import { AppShell, ShellPanel } from "@/components/AppShell";
import SettingsOverview from "./SettingsOverview";

type SettingsLayoutProps = {
  children: ReactNode;
};

/**
 * Master–detail: the overview and the active settings page sit side by side
 * from `sm` up. Below that only one of them is on screen — which one follows
 * the route, not the viewport, so there is no first-paint flash.
 */
export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const isMobile = useIsMobile();
  const [isIndex] = useRoute(settingsPaths.index);
  const backLink = isIndex || !isMobile ? recordPaths.index : settingsPaths.index;

  return (
    <AppShell
      mainClassName="sm:grid-cols-[17rem_minmax(0,1fr)] lg:grid-cols-[21rem_minmax(0,1fr)]"
      header={
        <>
          <Link variant="outline" size="icon" href={backLink} aria-label="Back">
            <ArrowLeft />
          </Link>
          <h1 className="font-bold font-display text-xl tracking-[-0.02em]">Settings</h1>
          <ThemeToggle className="ml-auto" />
        </>
      }
    >
      <ShellPanel className={cn(!isIndex && "hidden sm:block")}>
        <SettingsOverview />
      </ShellPanel>
      <ShellPanel className={cn(isIndex && "hidden sm:block")}>{children}</ShellPanel>
    </AppShell>
  );
}
