import { Link, useRoute, useLocation } from "wouter";
import { Fragment, useCallback, useEffect, useRef } from "react";
import { recordSlug } from "../data/routes";
import type { DecryptedRecord } from "@repo/schema";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/Item";
import { Skeleton } from "@repo/ui/components/Skeleton";
import { WebsiteAvatar } from "./WebsiteAvatar";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import { ArrowUpDownIcon } from "lucide-react";
import { useSortedRecords, SORT_LABELS } from "@repo/client/src/providers/SortedRecordsProvider";
import type { SortOption } from "@repo/client/src/providers/SortedRecordsProvider";
import { useGetRecords, useShortcut } from "@repo/client";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useEditingContext } from "@features/record/providers/EditingProvider";

type SidebarRecordProps = {
  record: DecryptedRecord;
  active: boolean;
  registerRef: (id: string, el: HTMLAnchorElement | null) => void;
};

function SidebarRecord({ record, active, registerRef }: SidebarRecordProps) {
  return (
    <Item
      variant={active ? "active" : "outline"}
      render={
        <Link
          href={`../${recordSlug}/${record.recordId}`}
          ref={(el: HTMLAnchorElement | null) => registerRef(record.recordId, el)}
        />
      }
    >
      <ItemMedia>
        <WebsiteAvatar title={record.title} websites={record.websites} />
      </ItemMedia>
      <ItemContent className="gap-1">
        <ItemTitle>{record.title}</ItemTitle>
        <ItemDescription className="line-clamp-1">{record.username || "-"}</ItemDescription>
      </ItemContent>
    </Item>
  );
}

function RecordSidebarSkeleton() {
  return (
    <ItemGroup className="max-w-sm">
      {Array.from({ length: 5 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
        <Item key={i} variant="outline">
          <ItemMedia>
            <Skeleton className="size-8 rounded-full" />
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

export default function RecordSidebar() {
  const [_, params] = useRoute(`/${recordSlug}/:recordId`);
  const [, navigate] = useLocation();
  const { ready } = useGetRecords();
  const { query, sort, sortedRecords, groups, handleSortChange } = useSortedRecords();
  const { isEditing } = useEditingContext();
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
        navigate(`/${recordSlug}/${nextRecord.recordId}`);
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
    enabled: ready && sortedRecords.length > 0 && !isEditing,
    allowInInput: true,
  });

  useShortcut("ArrowUp", () => navigateByOffset(-1), {
    description: "Previous record",
    enabled: ready && sortedRecords.length > 0 && !isEditing,
    allowInInput: true,
  });

  useEffect(() => {
    if (!isMobile && ready && !params?.recordId && sortedRecords.length > 0) {
      navigate(`/${recordSlug}/${sortedRecords[0].recordId}`, { replace: true });
    }
  }, [isMobile, ready, params?.recordId, sortedRecords, navigate]);

  // Auto-navigate to first filtered result when search query changes
  useEffect(() => {
    if (!isMobile && prevQueryRef.current !== query) {
      prevQueryRef.current = query;
      if (sortedRecords.length > 0) {
        navigate(`/${recordSlug}/${sortedRecords[0].recordId}`, { replace: true });
      }
    }
  }, [isMobile, query, sortedRecords, navigate]);

  if (!ready) return <RecordSidebarSkeleton />;

  const hasQuery = query.trim().length > 0;
  const noResults = hasQuery && sortedRecords.length === 0;

  return (
    <div className="flex sm:max-w-sm flex-col gap-2">
      <div className="flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="size-8">
                <ArrowUpDownIcon className="size-4" />
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
        <p className="text-sm text-muted-foreground px-1 py-4">No results</p>
      ) : (
        <ItemGroup>
          {groups.map((group) => (
            <Fragment key={group.label ?? "all"}>
              {group.label && (
                <p className="text-xs text-muted-foreground font-medium px-1 pt-2 first:pt-0">
                  {group.label}
                </p>
              )}
              {group.records.map((record) => (
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
