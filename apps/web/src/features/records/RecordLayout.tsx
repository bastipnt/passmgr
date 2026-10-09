import { AUTO_LOCK_DEFAULT_MINUTES, PREF_KEYS, usePreference, useShortcut } from "@repo/client";
import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import { ThemeToggle } from "@repo/ui/complex-components/ThemeToggle";
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
import {
  CircleHelpIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Link as RouterLink, useLocation } from "wouter";
import { recordPaths, settingsPaths } from "@/app/route-paths";
import { AppShell, ShellPanel } from "@/components/AppShell";
import ShortcutsHelpDialog from "@/components/ShortcutsHelpDialog";
import { useIdleLock } from "@/hooks/use-idle-lock";
import { modKey } from "@/lib/formatShortcut";
import BackupReminder from "./BackupReminder";
import { createSheetSearch } from "./CreateRecordSheet";
import { lockVault } from "./lock-vault";
import { NoSearchResults } from "./NoSearchResults";
import RecordList from "./RecordList";
import { SyncStatusMenu } from "./SyncStatusMenu";

type RecordLayoutProps = {
  children: ReactNode;
};

function SearchInput() {
  const { query, setQuery } = useSortedRecords();
  const inputRef = useRef<HTMLInputElement>(null);

  useShortcut("$mod+k", () => inputRef.current?.focus(), {
    description: "Focus search",
    allowInInput: true,
  });

  return (
    <InputGroup className="max-w-sm">
      <InputGroupAddon align="inline-start">
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        placeholder="Search vault…"
        aria-label="Search vault"
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
  const [helpOpen, setHelpOpen] = useState(false);
  const isMobile = useIsMobile();
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
              className="shrink-0 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-ring/25 lg:w-[calc(21rem-1rem)]"
            >
              <BrandMark className="sm:hidden" />
              <BrandLockup className="hidden sm:inline-flex" />
            </RouterLink>
            <SearchInput />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="hidden sm:inline-flex"
                onClick={() => setHelpOpen(true)}
                aria-label="Show keyboard shortcuts"
                title="Keyboard shortcuts"
              >
                <CircleHelpIcon />
              </Button>
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
              <ThemeToggle className="hidden md:inline-flex" />
              <Link variant="default" href={createSheetSearch()} aria-label="New record">
                <PlusIcon />
                <span className="hidden sm:inline">New record</span>
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
