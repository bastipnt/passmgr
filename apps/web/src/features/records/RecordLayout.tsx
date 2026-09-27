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

export default function RecordLayout({ children }: RecordLayoutProps) {
  const { isOffline } = useContext(SessionContext);
  const [, navigate] = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
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
        <ShellPanel className="scroll-py-4 p-3">
          <RecordSidebar />
        </ShellPanel>
        <MainContent>{children}</MainContent>
      </AppShell>
      <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </SortedRecordsProvider>
  );
}
