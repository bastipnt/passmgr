import {
  emptyCategoryCreateType,
  emptyCategoryHint,
  getRecordSubtitle,
  listHeading,
  RECORD_TYPE_LABELS,
  useGetRecords,
  useShortcut,
  useVaults,
  type VaultInfo,
} from "@repo/client";
import {
  activeFilterCount,
  type CategoryFilter,
  type RecordGroup,
  useSortedRecords,
} from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord } from "@repo/schema";
import { Button } from "@repo/ui/components/Button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/Item";
import UiLink from "@repo/ui/components/Link";
import { Skeleton } from "@repo/ui/components/Skeleton";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { useScrollCollapse } from "@repo/ui/hooks/use-scroll-collapse";
import { useStickyLabelFade } from "@repo/ui/hooks/use-sticky-label-fade";
import { cn } from "@repo/ui/lib/utils";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, StarIcon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { ImportDialog } from "@/features/import";
import { VaultTile } from "@/features/vaults";
import { ActiveFilterChips } from "./ActiveFilterChips";
import { createSheetSearch } from "./CreateRecordSheet";
import { RecordAvatar } from "./RecordAvatar";
import { RecordSearch } from "./RecordSearch";
import { RecordSortMenu } from "./RecordSortMenu";
import { SearchPanel } from "./SearchPanel";
import { PREVIEW_DELAY_MS, useSearchPanel } from "./use-search-panel";

type RecordRowProps = {
  record: DecryptedRecord;
  active: boolean;
  isMobile: boolean;
  /** Marked on the avatar where the list mixes several vaults. */
  vault?: VaultInfo;
  registerRef: (id: string, el: HTMLAnchorElement | null) => void;
};

/**
 * Desktop: a rounded list item with an active state. Phones (`max-sm:`): a
 * full-bleed table-view row with a hairline inset past the avatar and a
 * chevron — the record opens as its own page, so there is no active state.
 */
function RecordRow({ record, active, isMobile, vault, registerRef }: RecordRowProps) {
  // scroll-mt: RecordLayout's scroll padding covers the bar without the chips.
  // --vault-mark-ring: the row's own fill (Item's hover / active tints over the list's).
  return (
    <Item
      variant={active ? "active" : "default"}
      className={cn(
        active
          ? "[--vault-mark-ring:color-mix(in_oklab,var(--color-primary)_10%,var(--sticky-bar-fill))] hover:[--vault-mark-ring:color-mix(in_oklab,var(--color-primary)_15%,var(--sticky-bar-fill))] dark:[--vault-mark-ring:color-mix(in_oklab,var(--color-primary)_20%,var(--sticky-bar-fill))]"
          : "hover:[--vault-mark-ring:color-mix(in_oklab,var(--color-foreground)_5%,var(--sticky-bar-fill))]",
        "focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        "group/row gap-3 rounded-2xl px-2.5 py-2 max-sm:h-16 max-sm:gap-3.5 max-sm:rounded-none max-sm:py-0 max-sm:pr-0 max-sm:pl-5 max-sm:active:bg-foreground/5 sm:scroll-mt-(--list-chips-h)",
      )}
      render={
        <Link
          href={recordPaths.record(record.recordId)}
          ref={(el: HTMLAnchorElement | null) => registerRef(record.recordId, el)}
        />
      }
    >
      <ItemMedia className="max-sm:self-center! max-sm:translate-y-0!">
        <RecordAvatar record={record} size={isMobile ? "md" : "default"} vault={vault} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0 max-sm:flex-row max-sm:items-center max-sm:gap-2 max-sm:self-stretch max-sm:border-foreground/8 max-sm:border-t max-sm:pr-4 max-sm:group-first/row:border-t-0 dark:max-sm:border-white/8">
        <div className="min-w-0 flex-1">
          <ItemTitle className="font-semibold text-[0.95rem] max-sm:text-base">
            {record.title}
            {record.favorite && (
              <>
                <StarIcon className="size-3.5 shrink-0 fill-warning text-warning" aria-hidden />
                <span className="sr-only">Favorite</span>
              </>
            )}
          </ItemTitle>
          <ItemDescription className="line-clamp-1 text-[0.8rem] max-sm:text-sm">
            {getRecordSubtitle(record) || "—"}
          </ItemDescription>
        </div>
        <ChevronRightIcon
          className="size-4.5 shrink-0 text-muted-foreground/60 sm:hidden"
          aria-hidden
        />
      </ItemContent>
    </Item>
  );
}

/** "By vault": the group's sticky label, with the vault, its record count and a fold toggle. */
function VaultGroupHeader({
  group,
  vault,
  controls,
  onToggle,
}: {
  group: RecordGroup;
  vault: VaultInfo;
  controls: string;
  onToggle: (vaultId: string) => void;
}) {
  return (
    <h3 className="sticky-label-interactive z-11 flex h-(--list-label-h) items-center px-3 [--sticky-label-top:calc(var(--list-top,0px)+var(--list-bar-h))] max-sm:z-21 max-sm:items-end max-sm:px-2.5 max-sm:pb-0.5">
      <button
        type="button"
        aria-expanded={!group.folded}
        aria-controls={controls}
        onClick={() => onToggle(vault.vaultId)}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-1 text-left outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <VaultTile vault={vault} size="xs" />
        <span className="truncate font-semibold text-sm">{vault.name}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{group.records.length}</span>
        <ChevronDownIcon
          className={cn(
            "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
            group.folded && "-rotate-90",
          )}
          aria-hidden
        />
      </button>
    </h3>
  );
}

function RecordListSkeleton() {
  return (
    <ItemGroup className="gap-1 p-3 pt-15">
      {Array.from({ length: 5 }).map((_, i) => (
        // static skeleton list, index key is fine
        <Item key={i} className="gap-3 px-2.5 py-2">
          <ItemMedia>
            <Skeleton className="size-9 rounded-sm" />
          </ItemMedia>
          <ItemContent className="gap-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}

/**
 * Ghost rows standing in for the first items. On phones, where no empty page
 * sits beside the list, they also offer a way to fill it.
 */
function EmptyRecordList({
  categoryFilter,
  tagFilters,
  isMobile,
}: {
  categoryFilter: CategoryFilter;
  tagFilters: readonly string[];
  isMobile: boolean;
}) {
  const hint = emptyCategoryHint(categoryFilter, tagFilters);
  const createType = emptyCategoryCreateType(categoryFilter, tagFilters);
  return (
    <div className="flex flex-col gap-2">
      {[1, 0.7, 0.4].map((opacity) => (
        <div
          key={opacity}
          style={{ opacity }}
          className="flex items-center gap-3 rounded-2xl border border-foreground/12 border-dashed px-2.5 py-2 dark:border-white/12"
          aria-hidden
        >
          <span className="size-9 rounded-[10px] bg-foreground/8" />
          <span className="flex flex-1 flex-col gap-1.5">
            <span className="h-2.5 w-20 rounded-full bg-foreground/10" />
            <span className="h-2 w-32 rounded-full bg-foreground/8" />
          </span>
        </div>
      ))}
      <p className="px-1.5 pt-2 text-muted-foreground text-sm">
        {hint ?? "Your items will show up here, grouped by when you last used them."}
      </p>
      {isMobile && createType && (
        <UiLink
          variant="outline"
          size="lg"
          className="self-start"
          href={createSheetSearch(undefined, createType)}
        >
          <PlusIcon />
          New {RECORD_TYPE_LABELS[createType].noun}
        </UiLink>
      )}
      {isMobile && !hint && (
        <ImportDialog>
          <Button variant="outline" size="lg" className="self-start">
            <UploadIcon />
            Import from another app
          </Button>
        </ImportDialog>
      )}
    </div>
  );
}

/**
 * The phone list's large title — the page title, as the list is the screen.
 * Like `MobileRecordPage`'s, it scrolls up into MobileVault's bar (next to the
 * vault pill, which shrinks to its tile meanwhile), shrinking as it goes.
 * Sticky within the list, so it pins inside the bar, centered on the pill
 * (the bar's 3rem content box centers at +1.5rem; Bricolage's caps sit
 * centered in the h-9 line box, so +0.375rem). It collapses over the scroll
 * that carries it from its hero spot (0.75rem under the 3.75rem bar) up to
 * there: 4.5rem - 0.375rem.
 */
function MobileListTitle({ title, count }: { title: string; count: number }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useScrollCollapse(titleRef);

  return (
    <h1
      ref={titleRef}
      className={cn(
        "scroll-collapse pointer-events-none sticky top-[calc(max(env(safe-area-inset-top),0.75rem)+0.375rem)] z-30 mt-3 mb-1 flex h-9 flex-row items-center gap-1 whitespace-nowrap font-display font-extrabold leading-9 tracking-[-0.03em] [--scroll-collapse-range:4.125rem]",
        // Hero → bar: past the collapsed pill (px-4 + size-12 + 0.75rem). It clears
        // the pill sideways before rising level with it, so the two never overlap.
        // Not truncated (that clips descenders): "Wi-Fi networks n" is short enough.
        "ms-[calc(1.25rem+3.5rem*min(1,var(--scroll-collapse)*1.5))] text-[calc(2.125rem-1.0625rem*var(--scroll-collapse))]",
      )}
    >
      <span>{title}</span>{" "}
      <span className="ml-1 font-medium font-sans text-[calc(1.125rem-0.25rem*var(--scroll-collapse))] text-muted-foreground tabular-nums tracking-normal">
        {count}
      </span>
    </h1>
  );
}

export default function RecordList() {
  // Loose match: a record stays "in view" (highlighted, arrow-navigable) while
  // one of its sub-route sheets — edit, versions — is open.
  const [_, params] = useRoute(recordPaths.detailAny);
  const [isIndex] = useRoute(recordPaths.index);
  const [, navigate] = useLocation();
  const { ready } = useGetRecords();
  const {
    query,
    vaultFilter,
    categoryFilter,
    tagFilters,
    sortedRecords,
    recordGroups,
    hasGroupLabels,
    noteOpened,
    showVaultBadges,
    toggleVaultFold,
  } = useSortedRecords();
  const { getVault } = useVaults();
  const rowVault = (record: DecryptedRecord) =>
    showVaultBadges ? getVault(record.vaultId) : undefined;
  const isMobile = useIsMobile();
  const panel = useSearchPanel(!isMobile);
  const listboxId = useId();
  const groupsId = useId();
  const recordRefs = useRef(new Map<string, HTMLAnchorElement>());
  const shouldFocusRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const registerRef = useCallback((id: string, el: HTMLAnchorElement | null) => {
    if (el) recordRefs.current.set(id, el);
    else recordRefs.current.delete(id);
  }, []);

  // ↑↓ move the highlight at once; the record opens once they settle (as in the search).
  const [pendingId, setPendingId] = useState<string>();
  const highlightedId = pendingId ?? params?.recordId;

  const navigateByOffset = useCallback(
    (offset: number) => {
      if (sortedRecords.length === 0) return;
      const currentIndex = sortedRecords.findIndex((record) => record.recordId === highlightedId);
      const nextIndex = Math.max(0, Math.min(sortedRecords.length - 1, currentIndex + offset));
      const nextRecord = sortedRecords[nextIndex];
      if (nextRecord) {
        shouldFocusRef.current = true;
        setPendingId(nextRecord.recordId);
      }
    },
    [sortedRecords, highlightedId],
  );

  useEffect(() => {
    if (!pendingId) return;
    if (pendingId === params?.recordId) {
      setPendingId(undefined);
      return;
    }
    const timer = setTimeout(() => navigate(recordPaths.record(pendingId)), PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pendingId, params?.recordId, navigate]);

  // Another way to a record (a click, a link) drops a pending ↑↓.
  const routeRecordId = params?.recordId;
  const lastRouteRecordId = useRef(routeRecordId);
  if (lastRouteRecordId.current !== routeRecordId) {
    lastRouteRecordId.current = routeRecordId;
    if (pendingId && pendingId !== routeRecordId) setPendingId(undefined);
  }

  useEffect(() => {
    if (!shouldFocusRef.current || !highlightedId) return;
    const el = recordRefs.current.get(highlightedId);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
      shouldFocusRef.current = false;
    }
  }, [highlightedId]);

  // The list comes back when the search closes: bring the record it opened (or kept) into view.
  const searchWasOpen = useRef(false);
  useEffect(() => {
    if (panel.open) {
      searchWasOpen.current = true;
      return;
    }
    if (!searchWasOpen.current) return;
    searchWasOpen.current = false;
    if (highlightedId) recordRefs.current.get(highlightedId)?.scrollIntoView({ block: "center" });
  }, [panel.open, highlightedId]);

  // A filter that leaves the open record out of the list opens its first record
  // instead, or the empty page. Only on a filter change: a record opened from
  // "Search all items" may sit outside the filters on purpose.
  const filtersKey = [vaultFilter, categoryFilter, ...tagFilters].join("\u0000");
  const checkedFiltersKey = useRef(filtersKey);
  useEffect(() => {
    if (isMobile || !ready || panel.open || query.trim()) return;
    if (checkedFiltersKey.current === filtersKey) return;
    checkedFiltersKey.current = filtersKey;
    const openId = params?.recordId;
    // Folded "By vault" groups still list theirs.
    const listed = recordGroups.some((group) =>
      group.records.some((record) => record.recordId === openId),
    );
    if (!openId || listed) return;
    const first = sortedRecords[0];
    navigate(first ? recordPaths.record(first.recordId) : recordPaths.index, { replace: true });
  }, [
    isMobile,
    ready,
    panel.open,
    query,
    filtersKey,
    params?.recordId,
    recordGroups,
    sortedRecords,
    navigate,
  ]);

  // Search previews don't count as opened.
  useEffect(() => {
    if (params?.recordId && !panel.open) noteOpened(params.recordId);
  }, [params?.recordId, panel.open, noteOpened]);

  useShortcut("ArrowDown", () => navigateByOffset(1), {
    description: "Next record",
    enabled: ready && sortedRecords.length > 0 && !panel.open,
    allowInInput: true,
  });

  useShortcut("ArrowUp", () => navigateByOffset(-1), {
    description: "Previous record",
    enabled: ready && sortedRecords.length > 0 && !panel.open,
    allowInInput: true,
  });

  // Auto-select the first record, but only at the index — gating on
  // `!params?.recordId` alone would also fire on any unmatched sub-route and
  // eject the user out of it.
  useEffect(() => {
    if (!isMobile && ready && isIndex && sortedRecords.length > 0) {
      navigate(recordPaths.record(sortedRecords[0].recordId), { replace: true });
    }
  }, [isMobile, ready, isIndex, sortedRecords, navigate]);

  // Firefox has no scroll-driven animations; this fades the group labels instead.
  useStickyLabelFade(listRef, ready ? recordGroups : null);

  if (!ready)
    return (
      <>
        {!isMobile && (
          <div className="px-3 pt-3">
            <RecordSearch panel={panel} listboxId={listboxId} />
          </div>
        )}
        <RecordListSkeleton />
      </>
    );

  if (panel.open)
    return (
      <div className="flex min-h-full flex-col">
        <div className="sticky-bar px-3 pt-3 pb-1">
          <RecordSearch panel={panel} listboxId={listboxId} />
        </div>
        <SearchPanel panel={panel} listboxId={listboxId} />
      </div>
    );

  const hasQuery = query.trim().length > 0;
  // Folded "By vault" groups still count: they are listed, only collapsed.
  const listedCount = recordGroups.reduce((count, group) => count + group.records.length, 0);
  const noResults = hasQuery && listedCount === 0;
  const filtered = activeFilterCount(categoryFilter, tagFilters) > 0;

  return (
    <div
      ref={listRef}
      className={cn(
        "flex flex-col gap-2 pb-3 [--list-bar-h:calc(6.75rem+var(--list-chips-h))] [--list-chips-h:0px] max-sm:gap-0 max-sm:pb-0 max-sm:[--list-bar-h:0px] sm:[--list-label-h:2.25rem]",
        filtered && "sm:[--list-chips-h:3rem]",
      )}
    >
      {isMobile ? (
        <>
          <MobileListTitle title={listHeading(categoryFilter, hasQuery)} count={listedCount} />
          <ActiveFilterChips />
        </>
      ) : (
        <div
          className={cn(
            "sticky-bar flex h-(--list-bar-h) flex-col px-3 pt-3",
            hasGroupLabels && "[--sticky-bar-extend:var(--list-label-h)]",
          )}
        >
          <RecordSearch panel={panel} listboxId={listboxId} />
          <div className="flex min-h-0 flex-1 items-center justify-between gap-2 px-1.5">
            <h2 className="flex min-w-0 items-baseline gap-1.5 font-bold font-display text-lg tracking-[-0.02em]">
              <span className="truncate">{listHeading(categoryFilter, hasQuery)}</span>
              <span className="font-normal font-sans text-muted-foreground text-sm tabular-nums tracking-normal">
                {listedCount}
              </span>
            </h2>
            <RecordSortMenu />
          </div>
          {filtered && (
            <div className="pb-2">
              <ActiveFilterChips variant="desktop" />
            </div>
          )}
        </div>
      )}
      {noResults ? (
        // Phones search in `MobileSearch`, which has its own "no results" state.
        !isMobile && <p className="px-4 py-4 text-muted-foreground text-sm">No results</p>
      ) : listedCount === 0 ? (
        <div className="px-3 max-sm:px-4 max-sm:pt-4">
          <EmptyRecordList
            categoryFilter={categoryFilter}
            tagFilters={tagFilters}
            isMobile={isMobile}
          />
        </div>
      ) : (
        <div
          className={cn("flex flex-col gap-1 max-sm:gap-0", hasGroupLabels && "-mt-2 max-sm:mt-0")}
        >
          {recordGroups.map((recordGroup) => (
            <section key={recordGroup.vault?.vaultId ?? recordGroup.label ?? "all"}>
              {/* No frost of its own: the bar's reaches exactly --list-label-h
                  under it. z-11 keeps the label above that frost (sticky-bar is z-10;
                  on phones it's MobileVault's z-20 header, so z-21, under the z-25
                  dock); sticky-label fades it out as the next group pushes it into
                  the bar. Pushed up there it overlaps the bar's buttons, faded but
                  still hit-testable — hence pointer-events-none (the vault header:
                  sticky-label-interactive). */}
              {recordGroup.vault ? (
                <VaultGroupHeader
                  group={recordGroup}
                  vault={recordGroup.vault}
                  controls={`${groupsId}-${recordGroup.vault.vaultId}`}
                  onToggle={toggleVaultFold}
                />
              ) : (
                recordGroup.label && (
                  <h3 className="sticky-label pointer-events-none z-11 h-(--list-label-h) px-5 pt-3 pb-2 font-semibold text-[0.7rem] text-muted-foreground uppercase leading-4 tracking-[0.12em] [--sticky-label-top:calc(var(--list-top,0px)+var(--list-bar-h))] max-sm:z-21 max-sm:px-5 max-sm:pt-5 max-sm:pb-1.5 max-sm:text-xs max-sm:leading-4 max-sm:tracking-[0.08em]">
                    {recordGroup.label}
                  </h3>
                )
              )}
              {/* One wrapper per group, so each group's first row drops its hairline. */}
              <ItemGroup
                id={recordGroup.vault && `${groupsId}-${recordGroup.vault.vaultId}`}
                hidden={recordGroup.folded}
                className="gap-1 px-3 max-sm:gap-0 max-sm:px-0"
              >
                {recordGroup.records.map((record) => (
                  <RecordRow
                    key={record.recordId}
                    record={record}
                    active={!isMobile && record.recordId === highlightedId}
                    isMobile={isMobile}
                    vault={rowVault(record)}
                    registerRef={registerRef}
                  />
                ))}
              </ItemGroup>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
