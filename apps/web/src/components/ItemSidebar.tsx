import { Link, useRoute } from "wouter";
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
  const { items, ready } = useGetItems();

  if (!ready) return <ItemSidebarSkeleton />;

  return (
    <ItemGroup className="max-w-sm">
      {items.map((item) => (
        <SidebarItem key={item.itemId} item={item} active={item.itemId === params?.itemId} />
      ))}
    </ItemGroup>
  );
}
