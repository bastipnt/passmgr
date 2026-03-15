import { Link, useRoute, useLocation } from "wouter";
import { useEffect } from "react";
import { entrySlug } from "../data/routes";
import { useGetItems } from "@repo/client";
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
import { useSortedItems, SORT_LABELS } from "../hooks/use-sorted-items";
import type { SortOption } from "../hooks/use-sorted-items";

type SidebarItemProps = {
  item: DecryptedItem;
  active: boolean;
};

function SidebarItem({ item, active }: SidebarItemProps) {
  return (
    <Item variant={active ? "muted" : "outline"} asChild>
      <Link href={`../${entrySlug}/${item.itemId}`}>
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
  const { items, ready } = useGetItems();
  const { sort, sortedItems, handleSortChange } = useSortedItems(items);

  useEffect(() => {
    if (ready && !params?.itemId && sortedItems.length > 0) {
      navigate(`/${entrySlug}/${sortedItems[0].itemId}`, { replace: true });
    }
  }, [ready, params?.itemId, sortedItems, navigate]);

  if (!ready) return <ItemSidebarSkeleton />;

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
      <ItemGroup>
        {sortedItems.map((item) => (
          <SidebarItem key={item.itemId} item={item} active={item.itemId === params?.itemId} />
        ))}
      </ItemGroup>
    </div>
  );
}
