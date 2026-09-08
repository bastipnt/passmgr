import Link from "@repo/ui/components/Link";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useRoute } from "wouter";
import { recordPaths, settingsPaths } from "@/app/route-paths";
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
    <div className="grid h-screen grid-cols-1 grid-rows-[auto_1fr] sm:grid-cols-[250px_1fr] md:grid-cols-[300px_1fr]">
      <header className="col-span-2 flex flex-row content-stretch gap-4 border-b p-4">
        <Link variant="outline" size="icon" href={backLink}>
          <ArrowLeft className="h-[1.2rem] w-[1.2rem]" />
        </Link>
      </header>
      <main className="col-span-2 grid items-stretch overflow-hidden sm:grid-cols-subgrid">
        <SettingsOverview className={cn(!isIndex && "hidden sm:block")} />
        <section className={cn("overflow-y-auto", isIndex && "hidden sm:block")}>
          {children}
        </section>
      </main>
    </div>
  );
}
