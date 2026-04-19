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
import ItemSidebar from "@components/ItemSidebar";
import ShortcutsHelpDialog from "@components/ShortcutsHelpDialog";
import { CircleHelpIcon, PlusIcon, SearchIcon, SearchXIcon, XIcon } from "lucide-react";
import { SessionContext, useShortcut } from "@repo/client";
import {
  SortedItemsProvider,
  useSortedItems,
} from "@repo/client/src/providers/SortedItemsProvider";

import { modKey } from "@/lib/formatShortcut";
import { useEditingContext } from "@/providers/EditingProvider";
import { useCreateEntryContext } from "@/providers/CreateEntryProvider";

type LayoutProps = {
  children: ReactNode;
};

function SearchInput() {
  const { query, setQuery } = useSortedItems();
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
  const { query, setQuery } = useSortedItems();
  const { openCreateSheet } = useCreateEntryContext();

  return (
    <div className="h-full flex flex-col justify-center items-center">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>No Results</EmptyTitle>
          <EmptyDescription>No items matched your search.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button
            variant="default"
            onClick={() => {
              openCreateSheet(query.trim());
              setQuery("");
            }}
          >
            Create a new entry for &ldquo;{query.trim()}&rdquo;
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

function MainContent({ children }: { children: ReactNode }) {
  const { query, sortedItems } = useSortedItems();
  const noResults = query.trim().length > 0 && sortedItems.length === 0;

  return (
    <section className="overflow-y-scroll">{noResults ? <NoSearchResults /> : children}</section>
  );
}

export default function Layout({ children }: LayoutProps) {
  const { isOffline } = useContext(SessionContext);
  const { isEditing } = useEditingContext();
  const { openCreateSheet } = useCreateEntryContext();
  const [helpOpen, setHelpOpen] = useState(false);

  useShortcut("$mod+Shift+n", () => openCreateSheet(), {
    description: "Create new item",
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
    <SortedItemsProvider>
      <div className="h-screen grid grid-rows-[auto_1fr] grid-cols-[minmax(10vw,300px)_1fr]">
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
              New Item
            </Button>
          )}
        </header>
        <main className="grid grid-cols-subgrid col-span-2 items-stretch overflow-hidden">
          <section className="border-r p-4 overflow-y-scroll">
            <ItemSidebar />
          </section>
          <MainContent>{children}</MainContent>
        </main>
      </div>
      <ShortcutsHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </SortedItemsProvider>
  );
}
