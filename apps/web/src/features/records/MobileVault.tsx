import { useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import Link from "@repo/ui/components/Link";
import { useFlatGround } from "@repo/ui/hooks/use-flat-ground";
import { cn } from "@repo/ui/lib/utils";
import { PlusIcon } from "lucide-react";
import { VaultSwitcher } from "@/features/vaults";
import { AccountButton } from "./AccountSheet";
import { createSheetSearch } from "./CreateRecordSheet";
import { FilterButton } from "./FilterSheet";
import { MobileSearchButton, MobileSearchOverlay, useMobileSearch } from "./MobileSearch";
import RecordList from "./RecordList";
import { RecordSortMenu } from "./RecordSortMenu";

/**
 * Phone vault page, shaped like a native app rather than a shrunken desktop:
 * the list runs edge to edge over the ground under a large title (which
 * collapses into the bar on scroll) and the filters that are on, and the
 * controls float over it: the vault pill and the account button on top;
 * filter, search, sort and "new" in a bottom dock. Records open as pushed
 * pages (`MobileRecordPage`).
 *
 * The document scrolls, so Safari can run the list under its bars and
 * collapse its toolbar. Chrome is sticky rather than fixed: `DrawerProvider`'s
 * indent wrapper has `contain: layout`, which makes it the containing block
 * for `position: fixed`, so "fixed" chrome would scroll away with the page.
 */
export default function MobileVault() {
  const { hasGroupLabels } = useSortedRecords();
  const search = useMobileSearch();
  useFlatGround();

  return (
    // --list-top: the bar's exact height (top pad + size-12 buttons + pb-3),
    // so the list's group labels pin right beneath it. The bar's frost reaches
    // down under them (they have none of their own): one blur for bar and label.
    // --list-label-h sits here, not in RecordList, so the bar can read it.
    // Inert under the search, or iOS Safari's ▲ ▼ form bar steps into it.
    <div
      inert={search.open}
      className="relative isolate flex min-h-dvh flex-col [--list-label-h:2.625rem] [--list-top:calc(max(env(safe-area-inset-top),0.75rem)+3.75rem)]"
    >
      <header
        className={cn(
          "sticky-bar sticky-bar-edge z-20 flex h-(--list-top) shrink-0 items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3",
          hasGroupLabels && "[--sticky-bar-extend:var(--list-label-h)]",
        )}
      >
        <VaultSwitcher variant="pill" />
        <span className="flex-1" />
        <AccountButton />
      </header>

      <div className="flex-1">
        <RecordList />
      </div>

      {/* Pinned to the viewport bottom while the list runs on beneath it, and
          resting at the same spot once it ends. */}
      <div className="sticky bottom-[max(env(safe-area-inset-bottom),1rem)] z-25 mx-4 mt-4 mb-[max(env(safe-area-inset-bottom),1rem)] flex items-center gap-2.5">
        <FilterButton />
        <MobileSearchButton onOpen={search.openSearch} />
        <RecordSortMenu variant="fab" />
        <Link variant="default" size="fab" href={createSheetSearch()} aria-label="New item">
          <PlusIcon />
        </Link>
      </div>
      <MobileSearchOverlay state={search} />
    </div>
  );
}
