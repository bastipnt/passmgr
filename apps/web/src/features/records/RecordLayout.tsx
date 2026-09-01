import { SessionContext, useShortcut } from "@repo/client";
import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import { ThemeToggle } from "@repo/ui/complex-components/ThemeToggle";
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
import { CircleHelpIcon, PlusIcon, SearchIcon, SearchXIcon, XIcon } from "lucide-react";
import { type ReactNode, useContext, useRef, useState } from "react";
import { useLocation } from "wouter";
import ShortcutsHelpDialog from "@/components/ShortcutsHelpDialog";
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
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        placeholder="Search..."
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
          <EmptyTitle>No Results</EmptyTitle>
          <EmptyDescription>No records matched your search.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button
            variant="default"
            onClick={() => {
              openCreateSheet(query.trim());
              setQuery("");
            }}
          >
            Create a new record for &ldquo;{query.trim()}&rdquo;
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

function MainContent({ children }: { children: ReactNode }) {
  const { query, sortedRecords } = useSortedRecords();
  const noResults = query.trim().length > 0 && sortedRecords.length === 0;

  return noResults ? (
    <section className="overflow-y-scroll">
      <NoSearchResults />
    </section>
  ) : (
    children
  );
}

export default function RecordLayout({ children }: RecordLayoutProps) {
  const { isOffline } = useContext(SessionContext);
  const [, navigate] = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);

  useShortcut("$mod+Shift+n", () => navigate(createSheetSearch()), {
    description: "Create new record",
    enabled: !isOffline,
  });

  useShortcut("$mod+l", () => window.location.reload(), {
    description: "Lock vault",
    allowInInput: true,
  });

  useShortcut("Shift+?", () => setHelpOpen((o) => !o), {
    description: "Show keyboard shortcuts",
    allowInInput: false,
  });

  return (
    <SortedRecordsProvider>
      <div className="grid h-screen grid-cols-1 grid-rows-[auto_1fr] sm:grid-cols-[250px_1fr] md:grid-cols-[300px_1fr]">
        <header className="col-span-2 flex flex-row content-stretch gap-4 border-b p-4">
          <SearchInput />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setHelpOpen(true)}
            aria-label="Show keyboard shortcuts"
          >
            <CircleHelpIcon className="h-[1.2rem] w-[1.2rem]" />
          </Button>
          <ThemeToggle />
          {!isOffline && (
            <Link variant="default" href={createSheetSearch()}>
              <PlusIcon />
              New Record
            </Link>
          )}
        </header>
        <main className="col-span-2 grid items-stretch overflow-hidden sm:grid-cols-subgrid">
          <section className="scroll-py-4 overflow-y-scroll p-4 sm:border-r">
            <RecordSidebar />
          </section>
          <MainContent>{children}</MainContent>
        </main>
      </div>
      <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </SortedRecordsProvider>
  );
}
