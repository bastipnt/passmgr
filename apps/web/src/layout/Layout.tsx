import { useContext, type ReactNode } from "react";

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
import Link from "@repo/ui/components/Link";
import { ThemeToggle } from "@repo/ui/complex-components/ThemeToggle";
import ItemSidebar from "@components/ItemSidebar";
import { PlusIcon, SearchIcon, SearchXIcon, XIcon } from "lucide-react";
import { SessionContext } from "@repo/client";
import {
  SortedItemsProvider,
  useSortedItems,
} from "@repo/client/src/providers/SortedItemsProvider";

type LayoutProps = {
  children: ReactNode;
};

function SearchInput() {
  const { query, setQuery } = useSortedItems();
  return (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        placeholder="Search..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" onClick={() => setQuery("")} aria-label="Clear search">
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

function NoSearchResults() {
  const { query, setQuery } = useSortedItems();
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
          <Link
            variant="default"
            href={`/new?title=${encodeURIComponent(query.trim())}`}
            onClick={() => setQuery("")}
          >
            Create a new entry for &ldquo;{query.trim()}&rdquo;
          </Link>
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

  return (
    <SortedItemsProvider>
      <div className="h-screen grid grid-rows-[auto_1fr] grid-cols-[minmax(10vw,300px)_1fr]">
        <header className="flex flex-row gap-4 content-stretch p-4 border-b col-span-2">
          <SearchInput />
          <ThemeToggle />
          {!isOffline && (
            <Link href="/new" variant="default">
              <PlusIcon />
              New Item
            </Link>
          )}
        </header>
        <main className="grid grid-cols-subgrid col-span-2 items-stretch overflow-hidden">
          <section className="border-r p-4 overflow-y-scroll">
            <ItemSidebar />
          </section>
          <MainContent>{children}</MainContent>
        </main>
      </div>
    </SortedItemsProvider>
  );
}
