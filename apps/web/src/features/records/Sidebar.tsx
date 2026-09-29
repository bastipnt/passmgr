import { useGetRecords, useShortcut } from "@repo/client";
import type { SortOption } from "@repo/client/src/providers/SortedRecordsProvider";
import { SORT_LABELS, useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import type { DecryptedRecord } from "@repo/schema";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/Item";
import { Skeleton } from "@repo/ui/components/Skeleton";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { useStickyLabelFade } from "@repo/ui/hooks/use-sticky-label-fade";
import { cn } from "@repo/ui/lib/utils";
import { ArrowUpDownIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { WebsiteAvatar } from "./WebsiteAvatar";

type RecordRowProps = {
  record: DecryptedRecord;
  active: boolean;
  isMobile: boolean;
  registerRef: (id: string, el: HTMLAnchorElement | null) => void;
};

/**
 * Desktop: a rounded sidebar item with an active state. Phones (`max-sm:`): a
 * full-bleed table-view row with a hairline inset past the avatar and a
 * chevron — the record opens as its own page, so there is no active state.
 */
function RecordRow({ record, active, isMobile, registerRef }: RecordRowProps) {
  return (
    <Item
      variant={active ? "active" : "default"}
      className="group/row gap-3 rounded-2xl px-2.5 py-2 max-sm:h-16 max-sm:gap-3.5 max-sm:rounded-none max-sm:py-0 max-sm:pr-0 max-sm:pl-5 max-sm:active:bg-foreground/5"
      render={
        <Link
          href={recordPaths.record(record.recordId)}
          ref={(el: HTMLAnchorElement | null) => registerRef(record.recordId, el)}
        />
      }
    >
      <ItemMedia className="max-sm:self-center! max-sm:translate-y-0!">
        <WebsiteAvatar
          title={record.title}
          websites={record.websites}
          size={isMobile ? "md" : "default"}
        />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0 max-sm:flex-row max-sm:items-center max-sm:gap-2 max-sm:self-stretch max-sm:border-foreground/8 max-sm:border-t max-sm:pr-4 max-sm:group-first/row:border-t-0 dark:max-sm:border-white/8">
        <div className="min-w-0 flex-1">
          <ItemTitle className="font-semibold text-[0.95rem] max-sm:text-base">
            {record.title}
          </ItemTitle>
          <ItemDescription className="line-clamp-1 text-[0.8rem] max-sm:text-sm">
            {record.username || "—"}
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

function RecordSidebarSkeleton() {
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

/** Ghost rows standing in for the first logins. */
function EmptySidebar() {
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
        Your logins will show up here, grouped by when you last used them.
      </p>
    </div>
  );
}

export default function RecordSidebar() {
  // Loose match: a record stays "in view" (highlighted, arrow-navigable) while
  // one of its sub-route sheets — edit, versions — is open.
  const [_, params] = useRoute(recordPaths.detailAny);
  const [isIndex] = useRoute(recordPaths.index);
  const [, navigate] = useLocation();
  const { ready } = useGetRecords();
  const { query, sort, sortedRecords, recordGroups, handleSortChange } = useSortedRecords();
  const isMobile = useIsMobile();
  const prevQueryRef = useRef(query);
  const recordRefs = useRef(new Map<string, HTMLAnchorElement>());
  const shouldFocusRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const registerRef = useCallback((id: string, el: HTMLAnchorElement | null) => {
    if (el) recordRefs.current.set(id, el);
    else recordRefs.current.delete(id);
  }, []);

  const navigateByOffset = useCallback(
    (offset: number) => {
      if (sortedRecords.length === 0) return;
      const currentIndex = sortedRecords.findIndex(
        (record) => record.recordId === params?.recordId,
      );
      const nextIndex = Math.max(0, Math.min(sortedRecords.length - 1, currentIndex + offset));
      const nextRecord = sortedRecords[nextIndex];
      if (nextRecord) {
        shouldFocusRef.current = true;
        navigate(recordPaths.record(nextRecord.recordId));
      }
    },
    [sortedRecords, params?.recordId, navigate],
  );

  useEffect(() => {
    if (!shouldFocusRef.current || !params?.recordId) return;
    const el = recordRefs.current.get(params.recordId);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
      shouldFocusRef.current = false;
    }
  }, [params?.recordId]);

  useShortcut("ArrowDown", () => navigateByOffset(1), {
    description: "Next record",
    enabled: ready && sortedRecords.length > 0,
    allowInInput: true,
  });

  useShortcut("ArrowUp", () => navigateByOffset(-1), {
    description: "Previous record",
    enabled: ready && sortedRecords.length > 0,
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

  // Auto-navigate to first filtered result when search query changes
  useEffect(() => {
    if (!isMobile && prevQueryRef.current !== query) {
      prevQueryRef.current = query;
      if (sortedRecords.length > 0) {
        navigate(recordPaths.record(sortedRecords[0].recordId), { replace: true });
      }
    }
  }, [isMobile, query, sortedRecords, navigate]);

  // Firefox has no scroll-driven animations; this fades the group labels instead.
  useStickyLabelFade(listRef, ready ? recordGroups : null);

  if (!ready) return <RecordSidebarSkeleton />;

  const hasQuery = query.trim().length > 0;
  const hasGroupLabels = recordGroups.some((recordGroup) => recordGroup.label);
  const noResults = hasQuery && sortedRecords.length === 0;

  const sortMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-primary max-sm:-mr-2 dark:text-ring"
            aria-label="Sort records"
          >
            <ArrowUpDownIcon />
            {SORT_LABELS[sort]}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={sort} onValueChange={handleSortChange}>
          {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([value, label]) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // The phone list is the screen itself, so its heading is the page title.
  const Heading = isMobile ? "h1" : "h2";

  return (
    <div
      ref={listRef}
      className="flex flex-col gap-2 pb-3 [--list-bar-h:3.5rem] [--list-label-h:2.25rem] max-sm:gap-0 max-sm:pb-0 max-sm:[--list-bar-h:3.25rem] max-sm:[--list-label-h:2.625rem]"
    >
      {/* Pinned under MobileVault's bar on phones (--list-top), whose frost it
          provides as well. With group labels pinned beneath it, its frost
          spans them too: one bar, no seam. */}
      <div
        className={cn(
          "sticky-bar max-sm:sticky-bar-edge top-(--list-top,0px) flex h-(--list-bar-h) items-center justify-between gap-2 px-4.5 pt-1 [--sticky-bar-extend-up:var(--list-top,0px)] max-sm:items-end max-sm:px-5 max-sm:pt-0 max-sm:pb-1.5",
          hasGroupLabels && "[--sticky-bar-extend:var(--list-label-h)]",
        )}
      >
        <Heading className="font-semibold max-sm:font-display max-sm:font-extrabold max-sm:text-[2.125rem] max-sm:leading-none max-sm:tracking-[-0.03em]">
          Logins{" "}
          <span className="ml-0.5 font-normal text-muted-foreground text-sm tabular-nums max-sm:ml-1 max-sm:align-[0.25em] max-sm:font-medium max-sm:font-sans max-sm:text-lg max-sm:tracking-normal">
            {sortedRecords.length}
          </span>
        </Heading>
        {sortMenu}
      </div>
      {noResults ? (
        // Phones show the full "no results" state in the layout instead.
        !isMobile && <p className="px-4 py-4 text-muted-foreground text-sm">No results</p>
      ) : sortedRecords.length === 0 ? (
        <div className="px-3 max-sm:px-4 max-sm:pt-4">
          <EmptySidebar />
        </div>
      ) : (
        <div
          className={cn("flex flex-col gap-1 max-sm:gap-0", hasGroupLabels && "-mt-2 max-sm:mt-0")}
        >
          {recordGroups.map((recordGroup) => (
            <section key={recordGroup.label ?? "all"}>
              {/* No frost of its own: the bar's reaches exactly --list-label-h
                  under it. z-11 keeps the label above that frost (sticky-bar is z-10);
                  sticky-label fades it out as the next group pushes it into the bar. */}
              {recordGroup.label && (
                <h3 className="sticky-label z-11 h-(--list-label-h) px-5 pt-3 pb-2 font-semibold text-[0.7rem] text-muted-foreground uppercase leading-4 tracking-[0.12em] [--sticky-label-top:calc(var(--list-top,0px)+var(--list-bar-h))] max-sm:px-5 max-sm:pt-5 max-sm:pb-1.5 max-sm:text-xs max-sm:leading-4 max-sm:tracking-[0.08em]">
                  {recordGroup.label}
                </h3>
              )}
              {/* One wrapper per group, so each group's first row drops its hairline. */}
              <ItemGroup className="gap-1 px-3 max-sm:gap-0 max-sm:px-0">
                {recordGroup.records.map((record) => (
                  <RecordRow
                    key={record.recordId}
                    record={record}
                    active={!isMobile && record.recordId === params?.recordId}
                    isMobile={isMobile}
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
