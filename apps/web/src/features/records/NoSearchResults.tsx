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
import { PlusIcon, SearchXIcon, XIcon } from "lucide-react";
import { useOpenCreateSheet } from "./CreateRecordSheet";

export function NoSearchResults() {
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
