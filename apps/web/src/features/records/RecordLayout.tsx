import {
  AUTO_LOCK_DEFAULT_MINUTES,
  PREF_KEYS,
  usePreference,
  useShortcut,
  useVaults,
} from "@repo/client";
import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import { BrandLockup, BrandMark } from "@repo/ui/components/BrandMark";
import { Button } from "@repo/ui/components/Button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/ui/components/InputGroup";
import { Kbd } from "@repo/ui/components/Kbd";
import Link from "@repo/ui/components/Link";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { LockIcon, PlusIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useLocation, useSearchParams } from "wouter";
import { recordPaths, settingsPaths } from "@/app/route-paths";
import { AppShell, ShellPanel } from "@/components/AppShell";
import ShortcutsHelpDialog from "@/components/ShortcutsHelpDialog";
import { VaultSwitcher } from "@/features/vaults";
import { useIdleLock } from "@/hooks/use-idle-lock";
import { modKey } from "@/lib/formatShortcut";
import BackupReminder from "./BackupReminder";
import { createSheetSearch } from "./CreateRecordSheet";
import { useLockVault } from "./lock-vault";
import { NoSearchResults } from "./NoSearchResults";
import RecordList from "./RecordList";
import { SyncStatusMenu } from "./SyncStatusMenu";

type RecordLayoutProps = {
  children: ReactNode;
};

function SearchInput() {
  const { query, setQuery, vaultFilter } = useSortedRecords();
  const { getVault } = useVaults();
  const label = `Search ${vaultFilter === "all" ? "all vaults" : getVault(vaultFilter)?.name}`;
  const inputRef = useRef<HTMLInputElement>(null);

  useShortcut("$mod+k", () => inputRef.current?.focus(), {
    description: "Focus search",
    allowInInput: true,
  });

  return (
    <InputGroup className="ml-1 min-w-36 max-w-[34rem] flex-1">
      <InputGroupAddon align="inline-start">
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        placeholder={`${label}…`}
        aria-label={label}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.preventDefault();
            setQuery("");
          }
        }}
      />
      <InputGroupAddon align="inline-end">
        {query ? (
          <InputGroupButton size="icon-xs" onClick={() => setQuery("")} aria-label="Clear search">
            <XIcon />
          </InputGroupButton>
        ) : (
          <Kbd aria-hidden>{modKey}K</Kbd>
        )}
      </InputGroupAddon>
    </InputGroup>
  );
}

function MainContent({ children }: { children: ReactNode }) {
  const { query, sortedRecords } = useSortedRecords();
  const noResults = query.trim().length > 0 && sortedRecords.length === 0;

  return (
    <ShellPanel className="hidden sm:block">
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
        mainClassName="sm:grid-cols-[17rem_minmax(0,1fr)] lg:grid-cols-[21rem_minmax(0,1fr)]"
        header={
          <>
            <RouterLink
              href={recordPaths.index}
              aria-label="passmgr"
              className="shrink-0 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
            >
              <BrandMark className="md:hidden" />
              <BrandLockup className="hidden md:inline-flex" />
            </RouterLink>
            <span aria-hidden className="-mx-1.5 font-light text-2xl text-foreground/20">
              /
            </span>
            <VaultSwitcher variant="scope" />
            <SearchInput />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <SyncStatusMenu />
              <Link
                variant="outline"
                size="icon"
                href={settingsPaths.index}
                aria-label="Settings"
                title="Settings"
              >
                <SlidersHorizontalIcon />
              </Link>
              <Button
                variant="outline"
                size="icon"
                onClick={lockVault}
                aria-label="Lock vault"
                title="Lock vault"
              >
                <LockIcon />
              </Button>
              <Link variant="default" href={createSheetSearch()} aria-label="New record">
                <PlusIcon />
                <span className="hidden lg:inline">New record</span>
              </Link>
            </div>
          </>
        }
      >
        <ShellPanel viewportClassName="scroll-pt-24 scroll-pb-3">
          <RecordList />
        </ShellPanel>
        <MainContent>{children}</MainContent>
      </AppShell>
      <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <BackupReminder />
    </SortedRecordsProvider>
  );
}
