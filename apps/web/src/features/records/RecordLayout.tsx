import {
  AUTO_LOCK_DEFAULT_MINUTES,
  PREF_KEYS,
  SessionContext,
  usePreference,
  useShortcut,
} from "@repo/client";
import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import { ThemeToggle } from "@repo/ui/complex-components/ThemeToggle";
import { BrandLockup, BrandMark } from "@repo/ui/components/BrandMark";
import { Button } from "@repo/ui/components/Button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/Empty";
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
  SearchXIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useContext, useRef, useState } from "react";
import { Link as RouterLink, useLocation } from "wouter";
import { recordPaths, settingsPaths } from "@/app/route-paths";
import { AppShell, ShellPanel } from "@/components/AppShell";
import ShortcutsHelpDialog from "@/components/ShortcutsHelpDialog";
import { useIdleLock } from "@/hooks/use-idle-lock";
import { modKey } from "@/lib/formatShortcut";
import { createSheetSearch, useOpenCreateSheet } from "./CreateRecordSheet";
import RecordSidebar from "./Sidebar";

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
        placeholder="Search logins…"
        aria-label="Search logins"
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

/** Pill search floating in the bottom dock, within thumb reach. */
function MobileSearchInput() {
  const { query, setQuery } = useSortedRecords();

  return (
    <InputGroup className="h-14 flex-1 rounded-full border-foreground/8 bg-white/50 shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_12px_30px_-12px_rgb(22_20_31/0.3)] backdrop-blur-2xl backdrop-saturate-180 has-[[data-slot=input-group-control]:focus-visible]:bg-white/90 dark:border-white/14 dark:bg-[rgb(28_26_40/0.62)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_12px_30px_-12px_rgb(0_0_0/0.7)] dark:has-[[data-slot=input-group-control]:focus-visible]:bg-[rgb(28_26_40/0.8)]">
      <InputGroupAddon align="inline-start" className="pl-5">
        <SearchIcon className="size-5!" />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        enterKeyHint="search"
        className="text-base [&::-webkit-search-cancel-button]:hidden"
        placeholder="Search logins"
        aria-label="Search logins"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      {query && (
        <InputGroupAddon align="inline-end" className="pr-3">
          <InputGroupButton
            size="icon-sm"
            className="rounded-full"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

function NoSearchResults() {
  const { query, setQuery } = useSortedRecords();
  const openCreateSheet = useOpenCreateSheet();

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>No results for &ldquo;{query.trim()}&rdquo;</EmptyTitle>
          <EmptyDescription>
            Nothing in your vault matches. Search looks at titles, usernames and websites.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center">
          <Button variant="outline" onClick={() => setQuery("")}>
            <XIcon data-icon="inline-start" />
            Clear search
          </Button>
          <Button
            variant="default"
            onClick={() => {
              openCreateSheet(query.trim());
              setQuery("");
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Create &ldquo;{query.trim()}&rdquo;
          </Button>
        </EmptyContent>
      </Empty>
    </div>
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

type MobileVaultProps = {
  isOffline: boolean;
  onLock: () => void;
};

/**
 * Phone layout, shaped like a native app rather than a shrunken desktop: the
 * list runs edge to edge on solid ground under a large title, and the
 * controls float over it — actions top right, search and "new" in a bottom
 * dock. Records open as pushed pages (`RecordMobileDrawer`).
 *
 * The frame is exactly one viewport tall and scrolls an inner element, rather
 * than the document: `DrawerProvider`'s indent wrapper has `contain: layout`,
 * which makes it the containing block for `position: fixed`, so "fixed"
 * chrome inside a document-height page would scroll away with it.
 */
function MobileVault({ isOffline, onLock }: MobileVaultProps) {
  const { query, sortedRecords } = useSortedRecords();
  const noResults = query.trim().length > 0 && sortedRecords.length === 0;

  return (
    <div className="relative isolate h-dvh overflow-hidden">
      <div className="top-glow" aria-hidden />
      {/* Own stacking context (z-0): without it Chrome's backdrop-filter on
          the floating dock doesn't pick up the scrolled list, so no blur. */}
      {/* --list-top: this bar's exact height (top pad + size-10 buttons +
          pb-3), so the list's own bars pin right beneath it. No fade: the
          list heading is always pinned under it. */}
      <div className="relative z-0 h-full overflow-y-auto overscroll-contain pb-[calc(max(env(safe-area-inset-bottom),1rem)+5.5rem)] [--list-top:calc(max(env(safe-area-inset-top),0.75rem)+3.25rem)]">
        <header className="sticky-bar z-20 flex h-(--list-top) items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 [--sticky-bar-fade:0rem]">
          <RouterLink
            href={recordPaths.index}
            aria-label="passmgr"
            className="rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
          >
            <BrandMark />
          </RouterLink>
          <span className="flex-1" />
          <Button variant="floating" size="icon-lg" onClick={onLock} aria-label="Lock vault">
            <LockIcon />
          </Button>
          <Link variant="floating" size="icon-lg" href={settingsPaths.index} aria-label="Settings">
            <SlidersHorizontalIcon />
          </Link>
        </header>

        <RecordSidebar />
        {noResults && (
          <div className="pt-6">
            <NoSearchResults />
          </div>
        )}
      </div>

      <div className="absolute inset-x-4 bottom-[max(env(safe-area-inset-bottom),1rem)] z-20 flex items-center gap-2.5">
        <MobileSearchInput />
        {!isOffline && (
          <Link variant="default" size="fab" href={createSheetSearch()} aria-label="New login">
            <PlusIcon />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function RecordLayout({ children }: RecordLayoutProps) {
  const { isOffline } = useContext(SessionContext);
  const [, navigate] = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const isMobile = useIsMobile();
  const [autoLockMinutes] = usePreference<number>(
    PREF_KEYS.autoLockMinutes,
    AUTO_LOCK_DEFAULT_MINUTES,
  );

  // `secretsStore` is memory-only on web, so a reload drops every key. It also
  // discards unsaved sheet state, which is the right trade for a lock.
  const lockVault = () => window.location.reload();

  useIdleLock(autoLockMinutes, lockVault);

  useShortcut("$mod+Shift+n", () => navigate(createSheetSearch()), {
    description: "Create new record",
    enabled: !isOffline,
  });

  useShortcut("$mod+l", lockVault, {
    description: "Lock vault",
    allowInInput: true,
  });

  useShortcut("Shift+?", () => setHelpOpen((o) => !o), {
    description: "Show keyboard shortcuts",
    allowInInput: false,
  });

  if (isMobile) {
    return (
      <SortedRecordsProvider>
        <MobileVault isOffline={isOffline} onLock={lockVault} />
        {children}
      </SortedRecordsProvider>
    );
  }

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
              {!isOffline && (
                <Link variant="default" href={createSheetSearch()} aria-label="New record">
                  <PlusIcon />
                  <span className="hidden sm:inline">New record</span>
                </Link>
              )}
            </div>
          </>
        }
      >
        <ShellPanel viewportClassName="scroll-pt-24 scroll-pb-3">
          <RecordSidebar />
        </ShellPanel>
        <MainContent>{children}</MainContent>
      </AppShell>
      <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </SortedRecordsProvider>
  );
}
