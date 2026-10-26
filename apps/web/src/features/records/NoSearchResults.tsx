import { useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import { Button } from "@repo/ui/components/Button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/Empty";
import { PlusIcon, SearchIcon, SearchXIcon, XIcon } from "lucide-react";
import { useOpenCreateSheet } from "./CreateRecordSheet";

export function NoSearchResults() {
  const { query, setQuery, outsideScope, searchAllItems } = useSortedRecords();
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
            {outsideScope.length > 0
              ? `Nothing in this view matches, ${outsideScope.length} more outside it.`
              : "Nothing in your vault matches. Search looks at titles, usernames and websites."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center">
          {outsideScope.length > 0 && (
            <Button variant="outline" onClick={searchAllItems}>
              <SearchIcon data-icon="inline-start" />
              Search all items
            </Button>
          )}
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
