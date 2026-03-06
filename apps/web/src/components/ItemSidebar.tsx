import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useContext, useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { entrySlug } from "../data/routes";
import { SessionContext } from "@repo/client";
import { useLocalEntryAllOptions } from "@/store/use-local-entries";
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
import { decryptPayloadAsync } from "@/utils/vault";
import type { ItemPayload } from "@repo/schema";

type ItemSidebarProps = {
  itemId?: string;
};

type EncryptedItem = {
  itemId: string;
  encryptedData: string;
  encryptionNonce: string;
};

function EncryptedSidebarItem({ item, active, vaultReady }: { item: EncryptedItem; active: boolean; vaultReady: boolean }) {
  const [payload, setPayload] = useState<ItemPayload | null>(null);

  useEffect(() => {
    if (!vaultReady) return;
    let cancelled = false;
    void decryptPayloadAsync(item.itemId, item.encryptedData, item.encryptionNonce).then((p) => {
      if (!cancelled) setPayload(p);
    });
    return () => {
      cancelled = true;
    };
  }, [item.itemId, item.encryptedData, item.encryptionNonce, vaultReady]);

  if (!payload) {
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
      <Link href={`../${entrySlug}/${item.itemId}`}>
        <ItemMedia>
          <Avatar>
            <AvatarImage src={""} className="grayscale" />
            <AvatarFallback>{payload.title.charAt(0)}</AvatarFallback>
          </Avatar>
        </ItemMedia>
        <ItemContent className="gap-1">
          <ItemTitle>{payload.title}</ItemTitle>
          <ItemDescription className="line-clamp-1">{payload.username}</ItemDescription>
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
    ...useLocalEntryAllOptions(),
    select: (res) =>
      res.items.map((item) => ({
        itemId: item.itemId,
        encryptedData: item.encryptedData,
        encryptionNonce: item.encryptionNonce,
      })),
  });

  return (
    <ItemGroup className="max-w-sm">
      {data.map((item) => (
        <EncryptedSidebarItem key={item.itemId} item={item} active={item.itemId === itemId} vaultReady={vaultReady} />
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
