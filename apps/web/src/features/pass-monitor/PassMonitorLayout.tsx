import { formatTimeAgo } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { ScrollArea } from "@repo/ui/components/ScrollArea";
import { useFlatGround } from "@repo/ui/hooks/use-flat-ground";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { ShieldCheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation, useRoute } from "wouter";
import { overlayReturnPath } from "@/app/overlay-return";
import { usePageBack } from "@/app/page-transitions";
import { passMonitorPaths } from "@/app/route-paths";
import { AppShell } from "@/components/AppShell";
import { OverlayHeader } from "@/components/OverlayHeader";
import { BackToButton, CloseButton } from "@/components/PageBarButtons";
import { defaultFindingPath, useFindings } from "./findings";
import { useBreach, useMonitor } from "./PassMonitorContext";
import { PassMonitorSummary } from "./PassMonitorPage";

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

function useStatusLine() {
  const { monitored } = useMonitor();
  const { enabled, checking, lastCheckedAt } = useBreach();
  if (!monitored) return "Checking…";
  const vaults = new Set(monitored.map((record) => record.vaultId)).size;
  const counted = `${plural(monitored.length, "password")} in ${plural(vaults, "vault")}`;
  if (!enabled) return counted;
  if (checking) return `${counted} · checking breaches…`;
  return lastCheckedAt
    ? `${counted} · breaches checked ${formatTimeAgo(Date.parse(lastCheckedAt))}`
    : counted;
}

/** Desktop: a full-screen overlay, the findings beside the open one. Phone: an overview and a page per finding. */
export default function PassMonitorLayout({ children }: { children: ReactNode }) {
  return useIsMobile() ? (
    <PhonePassMonitor>{children}</PhonePassMonitor>
  ) : (
    <DesktopPassMonitor>{children}</DesktopPassMonitor>
  );
}

function DesktopPassMonitor({ children }: { children: ReactNode }) {
  useFlatGround();
  const [, navigate] = useLocation();
  const [isFindingPage, params] = useRoute(passMonitorPaths.page);
  const findings = useFindings();
  const breach = useBreach();
  const status = useStatusLine();
  const active = isFindingPage
    ? `${passMonitorPaths.index}/${params["*"]}`
    : defaultFindingPath(findings);

  return (
    <div className="flex h-dvh flex-col">
      <OverlayHeader
        icon={<ShieldCheckIcon aria-hidden="true" className="size-5 shrink-0 text-primary-text" />}
        title="Pass Monitor"
        closeLabel="Close Pass Monitor"
        onClose={() => navigate(overlayReturnPath())}
        actions={
          breach.enabled && (
            <Button
              variant="outline"
              disabled={breach.checking || breach.offline}
              onClick={breach.recheck}
            >
              Check again
            </Button>
          )
        }
      >
        <span className="truncate text-[13px] text-muted-foreground">{status}</span>
      </OverlayHeader>
      <div className="flex min-h-0 flex-1 gap-8 px-10 py-8">
        <aside className="flex w-100 shrink-0 flex-col gap-6 overflow-y-auto">
          <PassMonitorSummary active={active} />
        </aside>
        <ScrollArea render={<main />} className="min-h-0 min-w-0 flex-1">
          {children}
        </ScrollArea>
      </div>
    </div>
  );
}

function PhonePassMonitor({ children }: { children: ReactNode }) {
  const [isFindingPage] = useRoute(passMonitorPaths.page);
  const backToOverview = usePageBack(passMonitorPaths.index);
  const close = usePageBack(overlayReturnPath());

  return (
    <AppShell
      header={
        isFindingPage ? (
          <BackToButton label="Pass Monitor" onClick={backToOverview} />
        ) : (
          <CloseButton label="Close Pass Monitor" onClick={close} />
        )
      }
    >
      <section>{children}</section>
    </AppShell>
  );
}
