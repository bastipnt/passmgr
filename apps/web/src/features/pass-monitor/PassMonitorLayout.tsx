import { Button } from "@repo/ui/components/Button";
import Link from "@repo/ui/components/Link";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { ArrowLeft, ChevronLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useRoute } from "wouter";
import { usePageBack } from "@/app/page-transitions";
import { passMonitorPaths, recordPaths } from "@/app/route-paths";
import { AppShell, ShellPanel } from "@/components/AppShell";

/** Pass Monitor next to the vault: Back leads to the vault (on a phone, a finding page back to the overview). */
export default function PassMonitorLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [isFindingPage] = useRoute(passMonitorPaths.page);
  const backLink = isMobile && isFindingPage ? passMonitorPaths.index : recordPaths.index;
  const goBack = usePageBack(backLink);

  return (
    <AppShell
      header={
        <>
          {isMobile ? (
            <Button variant="floating" size="icon-xl" onClick={goBack} aria-label="Back">
              <ChevronLeftIcon className="size-5" />
            </Button>
          ) : (
            <Link variant="outline" size="icon" href={backLink} aria-label="Back">
              <ArrowLeft />
            </Link>
          )}
          <span className="font-bold font-display text-xl tracking-[-0.02em]">Pass Monitor</span>
        </>
      }
    >
      <ShellPanel>{children}</ShellPanel>
    </AppShell>
  );
}
