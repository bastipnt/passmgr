import { useContext, useRef, useState, type ReactNode } from "react";

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
import { ThemeToggle } from "@repo/ui/complex-components/ThemeToggle";
import RecordSidebar from "@components/Sidebar";
import ShortcutsHelpDialog from "@components/ShortcutsHelpDialog";
import { CircleHelpIcon, PlusIcon, SearchIcon, SearchXIcon, XIcon } from "lucide-react";
import { SessionContext, useShortcut } from "@repo/client";
import {
  SortedRecordsProvider,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import { modKey } from "@/lib/formatShortcut";
import { useEditingContext } from "@features/record/providers/EditingProvider";
import { useCreateRecordContext } from "@features/record/providers/CreateRecordProvider";

type RecordLayoutProps = {
  children: ReactNode;
};

function SearchInput() {
  const { query, setQuery } = useSortedRecords();
  const inputRef = useRef<HTMLInputElement>(null);
  const { isEditing } = useEditingContext();

  useShortcut("$mod+k", () => inputRef.current?.focus(), {
    description: "Focus search",
    enabled: !isEditing,
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
  const { openCreateSheet } = useCreateRecordContext();

  return (
    <div className="h-full flex flex-col justify-center items-center">
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
  const { isEditing } = useEditingContext();
  const { openCreateSheet } = useCreateRecordContext();
  const [helpOpen, setHelpOpen] = useState(false);

  useShortcut("$mod+Shift+n", () => openCreateSheet(), {
    description: "Create new record",
    enabled: !isOffline && !isEditing,
  });

  useShortcut("$mod+l", () => window.location.reload(), {
    description: "Lock vault",
    enabled: !isEditing,
    allowInInput: true,
  });

  useShortcut("Shift+?", () => setHelpOpen((o) => !o), {
    description: "Show keyboard shortcuts",
    enabled: !isEditing,
    allowInInput: false,
  });

  return (
    <SortedRecordsProvider>
      <div className="h-screen grid grid-rows-[auto_1fr] grid-cols-1 sm:grid-cols-[250px_1fr] md:grid-cols-[300px_1fr]">
        <header className="flex flex-row gap-4 content-stretch p-4 border-b col-span-2">
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
            <Button variant="default" onClick={() => openCreateSheet()}>
              <PlusIcon />
              New Record
            </Button>
          )}
        </header>
        <main className="grid sm:grid-cols-subgrid col-span-2 items-stretch overflow-hidden">
          <section className="sm:border-r p-4 overflow-y-scroll scroll-py-4">
            <RecordSidebar />
          </section>
          <MainContent>{children}</MainContent>
        </main>
      </div>
      <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </SortedRecordsProvider>
  );
}
