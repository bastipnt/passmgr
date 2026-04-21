import { Link, useRoute, useLocation } from "wouter";
import { Fragment, useCallback, useEffect, useRef } from "react";
import { entrySlug } from "../data/routes";
import type { DecryptedItem } from "@repo/schema";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/Item";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/Avatar";
import { Skeleton } from "@repo/ui/components/Skeleton";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import { ArrowUpDownIcon } from "lucide-react";
import { useSortedItems, SORT_LABELS } from "@repo/client/src/providers/SortedItemsProvider";
import type { SortOption } from "@repo/client/src/providers/SortedItemsProvider";
import { useGetItems, useShortcut } from "@repo/client";
import { useEditingContext } from "@/providers/EditingProvider";

type SidebarItemProps = {
  item: DecryptedItem;
  active: boolean;
  registerRef: (id: string, el: HTMLAnchorElement | null) => void;
};

function SidebarItem({ item, active, registerRef }: SidebarItemProps) {
  return (
    <Item variant={active ? "muted" : "outline"} asChild>
      <Link
        href={`../${entrySlug}/${item.itemId}`}
        ref={(el: HTMLAnchorElement | null) => registerRef(item.itemId, el)}
      >
        <ItemMedia>
          <Avatar>
            <AvatarImage src={""} className="grayscale" />
            <AvatarFallback>{item.title.charAt(0)}</AvatarFallback>
          </Avatar>
        </ItemMedia>
        <ItemContent className="gap-1">
          <ItemTitle>{item.title}</ItemTitle>
          <ItemDescription className="line-clamp-1">{item.username || "-"}</ItemDescription>
        </ItemContent>
      </Link>
    </Item>
  );
}

function ItemSidebarSkeleton() {
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

export default function ItemSidebar() {
  const [_, params] = useRoute(`/${entrySlug}/:itemId`);
  const [, navigate] = useLocation();
  const { ready } = useGetItems();
  const { query, sort, sortedItems, groups, handleSortChange } = useSortedItems();
  const { isEditing } = useEditingContext();
  const prevQueryRef = useRef(query);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const shouldFocusRef = useRef(false);

  const registerRef = useCallback((id: string, el: HTMLAnchorElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  }, []);

  const navigateByOffset = useCallback(
    (offset: number) => {
      if (sortedItems.length === 0) return;
      const currentIndex = sortedItems.findIndex((item) => item.itemId === params?.itemId);
      const nextIndex = Math.max(0, Math.min(sortedItems.length - 1, currentIndex + offset));
      const nextItem = sortedItems[nextIndex];
      if (nextItem) {
        shouldFocusRef.current = true;
        navigate(`/${entrySlug}/${nextItem.itemId}`);
      }
    },
    [sortedItems, params?.itemId, navigate],
  );

  useEffect(() => {
    if (!shouldFocusRef.current || !params?.itemId) return;
    const el = itemRefs.current.get(params.itemId);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
      shouldFocusRef.current = false;
    }
  }, [params?.itemId]);

  useShortcut("ArrowDown", () => navigateByOffset(1), {
    description: "Next item",
    enabled: ready && sortedItems.length > 0 && !isEditing,
    allowInInput: true,
  });

  useShortcut("ArrowUp", () => navigateByOffset(-1), {
    description: "Previous item",
    enabled: ready && sortedItems.length > 0 && !isEditing,
    allowInInput: true,
  });

  useEffect(() => {
    if (ready && !params?.itemId && sortedItems.length > 0) {
      navigate(`/${entrySlug}/${sortedItems[0].itemId}`, { replace: true });
    }
  }, [ready, params?.itemId, sortedItems, navigate]);

  // Auto-navigate to first filtered result when search query changes
  useEffect(() => {
    if (prevQueryRef.current !== query) {
      prevQueryRef.current = query;
      if (sortedItems.length > 0) {
        navigate(`/${entrySlug}/${sortedItems[0].itemId}`, { replace: true });
      }
    }
  }, [query, sortedItems, navigate]);

  if (!ready) return <ItemSidebarSkeleton />;

  const hasQuery = query.trim().length > 0;
  const noResults = hasQuery && sortedItems.length === 0;

  return (
    <div className="flex max-w-sm flex-col gap-2">
      <div className="flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <ArrowUpDownIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
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
              {group.items.map((item) => (
                <SidebarItem
                  key={item.itemId}
                  item={item}
                  active={item.itemId === params?.itemId}
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
