import { AUTO_LOCK_DEFAULT_MINUTES, PREF_KEYS, usePreference, useShortcut } from "@repo/client";
import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import { Button } from "@repo/ui/components/Button";
import { Kbd } from "@repo/ui/components/Kbd";
import { TooltipProvider } from "@repo/ui/components/Tooltip";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import { LockIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { useLocation, useSearchParams } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { AppShell, ShellPanel } from "@/components/AppShell";
import ShortcutsHelpDialog from "@/components/ShortcutsHelpDialog";
import { useIdleLock } from "@/hooks/use-idle-lock";
import { modKey } from "@/lib/formatShortcut";
import BackupReminder from "./BackupReminder";
import { CategorySidebar, SidebarTagsRow } from "./CategorySidebar";
import { createSheetSearch } from "./CreateRecordSheet";
import { useLockVault } from "./lock-vault";
import { NoSearchResults } from "./NoSearchResults";
import RecordList from "./RecordList";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarHeader } from "./SidebarHeader";
import { useSidebarCollapsed } from "./use-sidebar-collapsed";

type RecordLayoutProps = {
  children: ReactNode;
};

function LockButton({ collapsed, onLock }: { collapsed: boolean; onLock: () => void }) {
  if (collapsed)
    return (
      <Button
        variant="outline"
        size="icon-lg"
        onClick={onLock}
        aria-label="Lock vault"
        title="Lock vault"
        className="self-center"
      >
        <LockIcon />
      </Button>
    );

  return (
    <Button
      variant="outline"
      size="lg"
      onClick={onLock}
      className="h-10 px-3 font-semibold text-sm"
    >
      <LockIcon />
      <span className="flex-1 text-left">Lock vault</span>
      <Kbd aria-hidden>{modKey}L</Kbd>
    </Button>
  );
}

function MainContent({ children }: { children: ReactNode }) {
  const { query, sortedRecords } = useSortedRecords();
  const noResults = query.trim().length > 0 && sortedRecords.length === 0;

  return (
    <ShellPanel surface="ground" className="hidden sm:block">
      {noResults ? <NoSearchResults /> : children}
    </ShellPanel>
  );
}

export default function RecordLayout({ children }: RecordLayoutProps) {
  const [, navigate] = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // A one-shot request (Settings → General): read once, then dropped, so a reload doesn't reopen it.
  const [helpOpen, setHelpOpen] = useState(() => searchParams.has(recordPaths.shortcutsParam));
  useEffect(() => {
    if (!searchParams.has(recordPaths.shortcutsParam)) return;
    const next = new URLSearchParams(searchParams);
    next.delete(recordPaths.shortcutsParam);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const isMobile = useIsMobile();
  const lockVault = useLockVault();
  const [autoLockMinutes] = usePreference<number>(
    PREF_KEYS.autoLockMinutes,
    AUTO_LOCK_DEFAULT_MINUTES,
  );

  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  const sidebarId = useId();

  useIdleLock(autoLockMinutes, lockVault);

  useShortcut("$mod+Shift+n", () => navigate(createSheetSearch()), {
    description: "Create new record",
  });

  useShortcut("$mod+l", lockVault, {
    description: "Lock vault",
    allowInInput: true,
  });

  useShortcut("Shift+?", () => setHelpOpen((o) => !o), {
    description: "Show keyboard shortcuts",
    allowInInput: false,
  });

  // Phones: every route is its own page (`MobileVault`, `MobileRecordPage`).
  if (isMobile)
    return (
      <SortedRecordsProvider>
        {children}
        <BackupReminder />
      </SortedRecordsProvider>
    );

  return (
    <SortedRecordsProvider>
      <AppShell
        mainClassName={cn(
          "transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none",
          sidebarCollapsed
            ? "sm:grid-cols-[4rem_19rem_minmax(0,1fr)] xl:grid-cols-[4rem_24rem_minmax(0,1fr)]"
            : "lg:grid-cols-[15rem_20rem_minmax(0,1fr)] xl:grid-cols-[15rem_24rem_minmax(0,1fr)]",
        )}
      >
        <ShellPanel
          id={sidebarId}
          surface="ground"
          viewportClassName={cn("flex flex-col gap-3 p-0.5", !sidebarCollapsed && "pr-1.5")}
        >
          <TooltipProvider>
            <SidebarHeader
              collapsed={sidebarCollapsed}
              onCollapsedChange={setSidebarCollapsed}
              controlsId={sidebarId}
            />
            <CategorySidebar collapsed={sidebarCollapsed} />
            <SidebarTagsRow collapsed={sidebarCollapsed} />
            <div className="mt-auto flex flex-col gap-2">
              <SidebarFooter collapsed={sidebarCollapsed} />
              <LockButton collapsed={sidebarCollapsed} onLock={lockVault} />
            </div>
          </TooltipProvider>
        </ShellPanel>
        <ShellPanel viewportClassName="scroll-pt-[10.25rem] scroll-pb-3">
          <RecordList />
        </ShellPanel>
        <MainContent>{children}</MainContent>
      </AppShell>
      <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <BackupReminder />
    </SortedRecordsProvider>
  );
}
