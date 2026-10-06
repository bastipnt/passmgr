import { useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import { BrandMark } from "@repo/ui/components/BrandMark";
import { Button } from "@repo/ui/components/Button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/ui/components/InputGroup";
import Link from "@repo/ui/components/Link";
import { cn } from "@repo/ui/lib/utils";
import { LockIcon, PlusIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { Link as RouterLink } from "wouter";
import { recordPaths, settingsPaths } from "@/app/route-paths";
import ShellBackdrop from "@/components/ShellBackdrop";
import { createSheetSearch } from "./CreateRecordSheet";
import { lockVault } from "./lock-vault";
import { NoSearchResults } from "./NoSearchResults";
import RecordList from "./RecordList";
import { RecordSortMenu } from "./RecordSortMenu";

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

/**
 * Phone vault page, shaped like a native app rather than a shrunken desktop:
 * the list runs edge to edge over the light field under a large title (which
 * collapses into the bar on scroll), and the controls float over it — actions
 * top right, search, sort and "new" in a bottom dock. Records open as pushed
 * pages (`MobileRecordPage`).
 *
 * The document scrolls, so Safari can run the list under its bars and
 * collapse its toolbar. Chrome is sticky rather than fixed: `DrawerProvider`'s
 * indent wrapper has `contain: layout`, which makes it the containing block
 * for `position: fixed`, so "fixed" chrome would scroll away with the page.
 */
export default function MobileVault() {
  const { query, sortedRecords, hasGroupLabels } = useSortedRecords();
  const noResults = query.trim().length > 0 && sortedRecords.length === 0;

  return (
    // --list-top: the bar's exact height (top pad + size-12 buttons + pb-3),
    // so the list's group labels pin right beneath it. The bar's frost reaches
    // down under them (they have none of their own): one blur for bar and label.
    // --list-label-h sits here, not in RecordList, so the bar can read it.
    <div className="relative isolate flex min-h-dvh flex-col [--list-label-h:2.625rem] [--list-top:calc(max(env(safe-area-inset-top),0.75rem)+3.75rem)]">
      <ShellBackdrop />
      <header
        className={cn(
          "sticky-bar sticky-bar-edge z-20 flex h-(--list-top) shrink-0 items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3",
          hasGroupLabels && "[--sticky-bar-extend:var(--list-label-h)]",
        )}
      >
        <RouterLink
          href={recordPaths.index}
          aria-label="passmgr"
          className="rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
        >
          <BrandMark />
        </RouterLink>
        <span className="flex-1" />
        <Button variant="floating" size="icon-xl" onClick={lockVault} aria-label="Lock vault">
          <LockIcon />
        </Button>
        <Link variant="floating" size="icon-xl" href={settingsPaths.index} aria-label="Settings">
          <SlidersHorizontalIcon />
        </Link>
      </header>

      <div className="flex-1">
        <RecordList />
        {noResults && (
          <div className="pt-6">
            <NoSearchResults />
          </div>
        )}
      </div>

      {/* Pinned to the viewport bottom while the list runs on beneath it, and
          resting at the same spot once it ends. */}
      <div className="sticky bottom-[max(env(safe-area-inset-bottom),1rem)] z-25 mx-4 mt-4 mb-[max(env(safe-area-inset-bottom),1rem)] flex items-center gap-2.5">
        <MobileSearchInput />
        <RecordSortMenu variant="fab" />
        <Link variant="default" size="fab" href={createSheetSearch()} aria-label="New login">
          <PlusIcon />
        </Link>
      </div>
    </div>
  );
}
