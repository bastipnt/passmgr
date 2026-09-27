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
import { ArrowUpDownIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { WebsiteAvatar } from "./WebsiteAvatar";

type SidebarRecordProps = {
  record: DecryptedRecord;
  active: boolean;
  registerRef: (id: string, el: HTMLAnchorElement | null) => void;
};

function SidebarRecord({ record, active, registerRef }: SidebarRecordProps) {
  return (
    <Item
      variant={active ? "active" : "default"}
      className="gap-3 rounded-2xl px-2.5 py-2"
      render={
        <Link
          href={recordPaths.record(record.recordId)}
          ref={(el: HTMLAnchorElement | null) => registerRef(record.recordId, el)}
        />
      }
    >
      <ItemMedia>
        <WebsiteAvatar title={record.title} websites={record.websites} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0">
        <ItemTitle className="font-semibold text-[0.95rem]">{record.title}</ItemTitle>
        <ItemDescription className="line-clamp-1 text-[0.8rem]">
          {record.username || "—"}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}

function RecordSidebarSkeleton() {
  return (
    <ItemGroup className="gap-1 pt-12">
      {Array.from({ length: 5 }).map((_, i) => (
        // static skeleton list, index key is fine
        <Item key={i} className="gap-3 px-2.5 py-2">
          <ItemMedia>
            <Skeleton className="size-9 rounded-[10px]" />
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

  if (!ready) return <RecordSidebarSkeleton />;

  const hasQuery = query.trim().length > 0;
  const noResults = hasQuery && sortedRecords.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1.5 pt-1 pb-1">
        <h2 className="font-semibold">
          Logins{" "}
          <span className="ml-0.5 font-normal text-muted-foreground text-sm tabular-nums">
            {sortedRecords.length}
          </span>
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" aria-label="Sort records">
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
      </div>
      {noResults ? (
        <p className="px-1 py-4 text-muted-foreground text-sm">No results</p>
      ) : sortedRecords.length === 0 ? (
        <EmptySidebar />
      ) : (
        <ItemGroup className="gap-1">
          {recordGroups.map((recordGroup) => (
            <Fragment key={recordGroup.label ?? "all"}>
              {recordGroup.label && (
                <p className="px-2 pt-3 pb-1 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em] first:pt-1">
                  {recordGroup.label}
                </p>
              )}
              {recordGroup.records.map((record) => (
                <SidebarRecord
                  key={record.recordId}
                  record={record}
                  active={record.recordId === params?.recordId}
                  registerRef={registerRef}
                />
              ))}
            </Fragment>
          ))}
        </ItemGroup>
      )}
    </div>
  );
}
