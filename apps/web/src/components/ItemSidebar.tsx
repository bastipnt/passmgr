import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { Link, useRoute } from "wouter";
import { entrySlug } from "../data/routes";
import { useTRPC } from "@repo/client";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/Item";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/Avatar";

type ItemSidebarProps = {
  itemId?: string;
};

function ItemSidebarInner({ itemId }: ItemSidebarProps) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.entry.all.queryOptions());

  return (
    <ItemGroup className="max-w-sm">
      {data.items.map(({ id, title, username }) => {
        const active = id === itemId;

        return (
          <Item key={id} variant={active ? "muted" : "outline"} asChild>
            <Link href={`../${entrySlug}/${id}`}>
              <ItemMedia>
                <Avatar>
                  <AvatarImage src={""} className="grayscale" />
                  <AvatarFallback>{title.charAt(0)}</AvatarFallback>
                </Avatar>
              </ItemMedia>
              <ItemContent className="gap-1">
                <ItemTitle>{title}</ItemTitle>
                <ItemDescription>{username}</ItemDescription>
              </ItemContent>
            </Link>
          </Item>
        );
      })}
    </ItemGroup>
  );
}

export default function ItemSidebar() {
  const [_, params] = useRoute(`/${entrySlug}/:itemId`);

  return (
    <Suspense fallback={<p>No Data</p>}>
      <ItemSidebarInner itemId={params?.itemId} />
    </Suspense>
  );
}
