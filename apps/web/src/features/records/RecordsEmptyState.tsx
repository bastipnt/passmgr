import { IMPORT_SOURCE_LIST, RECORD_TYPE_LABELS } from "@repo/client";
import {
  activeFilterCount,
  emptyCategoryCreateType,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { RecordType } from "@repo/schema";
import { BrandMark } from "@repo/ui/components/BrandMark";
import { Button } from "@repo/ui/components/Button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/Empty";
import Link from "@repo/ui/components/Link";
import {
  FilterXIcon,
  LockIcon,
  PlusIcon,
  RefreshCwIcon,
  UploadIcon,
  WifiOffIcon,
} from "lucide-react";
import { ImportDialog } from "@/features/import";
import { createSheetSearch } from "./CreateRecordSheet";

const FEATURES = [
  { icon: LockIcon, label: "End-to-end encrypted" },
  { icon: RefreshCwIcon, label: "Syncs to web & mobile" },
  { icon: WifiOffIcon, label: "Works offline" },
];

/** Stacked cards: two tilted blanks behind the brand tile. */
function VaultIllustration() {
  return (
    <div className="relative h-32 w-52" aria-hidden>
      <div className="absolute inset-x-2 top-6 h-24 -rotate-6 rounded-2xl border border-foreground/10 bg-foreground/[0.04] dark:border-white/10 dark:bg-white/[0.05]" />
      <div className="absolute inset-x-2 top-6 h-24 rotate-6 rounded-2xl border border-foreground/10 bg-foreground/[0.04] dark:border-white/10 dark:bg-white/[0.05]" />
      <div className="absolute inset-x-7 top-0 grid h-24 place-items-center rounded-2xl bg-primary shadow-primary/30 shadow-xl">
        <BrandMark className="size-12 bg-transparent" />
      </div>
    </div>
  );
}

/** The category and tags in view leave nothing: the vault itself has records. */
function FilteredEmptyState({
  createType,
  onClear,
}: {
  createType: RecordType | undefined;
  onClear: () => void;
}) {
  const labels = createType && RECORD_TYPE_LABELS[createType];
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <Empty className="gap-6">
        <EmptyHeader className="max-w-md gap-3">
          <EmptyMedia variant="icon">
            <FilterXIcon />
          </EmptyMedia>
          <EmptyTitle className="text-2xl">
            {labels ? `No ${labels.nouns} yet` : "Nothing matches these filters"}
          </EmptyTitle>
          <EmptyDescription className="text-base">
            {labels
              ? `Add your first ${labels.noun}, or clear the filter to see everything.`
              : "The category or tags picked leave no item in this vault."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center">
          {labels && (
            <Link variant="default" href={createSheetSearch(undefined, createType)}>
              <PlusIcon />
              New {labels.noun}
            </Link>
          )}
          <Button variant="secondary" onClick={onClear}>
            Clear filters
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

export default function RecordsEmptyState() {
  const { categoryFilter, tagFilters, sortedRecords, clearFilters } = useSortedRecords();
  if (activeFilterCount(categoryFilter, tagFilters) > 0 && sortedRecords.length === 0)
    return (
      <FilteredEmptyState
        createType={emptyCategoryCreateType(categoryFilter, tagFilters)}
        onClear={clearFilters}
      />
    );
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <Empty className="gap-6">
        <EmptyHeader className="max-w-md gap-3">
          <EmptyMedia>
            <VaultIllustration />
          </EmptyMedia>
          <EmptyTitle className="text-3xl">Your vault is empty</EmptyTitle>
          <EmptyDescription className="text-base">
            Add your first login, card or note to get started. It&apos;s encrypted on this device
            before it ever reaches the server.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-md gap-6">
          <div className="flex flex-wrap justify-center gap-2">
            <Link variant="default" size="lg" href={createSheetSearch()}>
              <PlusIcon />
              Create record
            </Link>
            <ImportDialog>
              <Button variant="outline" size="lg">
                <UploadIcon />
                Import
              </Button>
            </ImportDialog>
          </div>
          <p className="text-muted-foreground text-sm">
            Moving from another password manager? Import its export from {IMPORT_SOURCE_LIST}, or a
            backup of this app.
          </p>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-muted-foreground text-sm">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5">
                <Icon className="size-4 text-primary-text" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </EmptyContent>
      </Empty>
    </div>
  );
}
