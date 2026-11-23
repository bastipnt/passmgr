import { useSortedRecords } from "@repo/client";
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
 * The document scrolls (Safari collapses its bars). Chrome is sticky, not fixed: `DrawerProvider`'s indent wrapper
 * has `contain: layout`, the containing block for `position: fixed`, so fixed chrome would scroll away with the page.
 */
export default function MobileVault() {
  const { hasGroupLabels } = useSortedRecords();
  const search = useMobileSearch();
  useFlatGround();

  return (
    // The bar's frost covers the list's labels too (one blur), so --list-label-h is set here.
    // Inert under the search, or iOS Safari's ▲ ▼ form bar steps into it.
    <main
      inert={search.open}
      className="relative isolate flex min-h-dvh flex-col [--list-label-h:2.625rem] [--list-top:var(--vault-bar-h)]"
    >
      <header
        className={cn(
          "sticky-bar sticky-bar-edge z-page-bar flex h-(--list-top) shrink-0 items-center gap-2 px-4 pt-(--page-bar-pad) pb-3",
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
      <div className="sticky bottom-(--dock-inset) z-dock mx-4 mt-4 mb-(--dock-inset) flex items-center gap-2.5">
        <FilterButton />
        <MobileSearchButton onOpen={search.openSearch} />
        <RecordSortMenu variant="fab" />
        <Link variant="default" size="fab" href={createSheetSearch()} aria-label="New item">
          <PlusIcon />
        </Link>
      </div>
      <MobileSearchOverlay state={search} />
    </main>
  );
}
