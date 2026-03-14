import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useContext, useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { entrySlug } from "../data/routes";
import { decryptItemWithWorker, SessionContext, useGetAllItemsOptions } from "@repo/client";
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
import type { ItemSchema } from "@repo/schema";

type ItemSidebarProps = {
  itemId?: string;
};

type EncryptedItem = {
  itemId: string;
  encryptedData: string;
  encryptionNonce: string;
};

type SidebarItemProps = {
  encryptedItem: EncryptedItem;
  active: boolean;
  vaultReady: boolean;
};

function SidebarItem({ encryptedItem, active, vaultReady }: SidebarItemProps) {
  const [item, setItem] = useState<ItemSchema | null>(null);

  useEffect(() => {
    if (!vaultReady) return;
    let cancelled = false;
    void decryptItemWithWorker(encryptedItem.encryptedData, encryptedItem.encryptionNonce).then(
      (decryptedItem) => {
        if (!cancelled) setItem(decryptedItem);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    encryptedItem.itemId,
    encryptedItem.encryptedData,
    encryptedItem.encryptionNonce,
    vaultReady,
  ]);

  if (!item) {
    return (
      <Item variant={active ? "muted" : "outline"}>
        <ItemMedia>
          <Skeleton className="size-8 rounded-full" />
        </ItemMedia>
        <ItemContent className="gap-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </ItemContent>
      </Item>
    );
  }

  return (
    <Item variant={active ? "muted" : "outline"} asChild>
      <Link href={`../${entrySlug}/${encryptedItem.itemId}`}>
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

function ItemSidebarInner({ itemId }: ItemSidebarProps) {
  const { vaultReady } = useContext(SessionContext);
  const { data } = useSuspenseQuery({
    ...useGetAllItemsOptions(),
    select: (res) =>
      res.items.map((encryptedItem) => ({
        itemId: encryptedItem.itemId,
        encryptedData: encryptedItem.encryptedData,
        encryptionNonce: encryptedItem.encryptionNonce,
      })),
  });

  return (
    <ItemGroup className="max-w-sm">
      {data.map((encryptedItem) => (
        <SidebarItem
          key={encryptedItem.itemId}
          encryptedItem={encryptedItem}
          active={encryptedItem.itemId === itemId}
          vaultReady={vaultReady}
        />
      ))}
    </ItemGroup>
  );
}

export default function ItemSidebar() {
  const [_, params] = useRoute(`/${entrySlug}/:itemId`);

  return (
    <Suspense fallback={<ItemSidebarSkeleton />}>
      <ItemSidebarInner itemId={params?.itemId} />
    </Suspense>
  );
}
