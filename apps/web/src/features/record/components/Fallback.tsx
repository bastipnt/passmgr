import { Skeleton } from "@repo/ui/components/Skeleton";
import { Item, ItemContent, ItemMedia, ItemGroup } from "@repo/ui/components/Item";

export function Fallback() {
  return (
    <div className="grid grid-cols-1 p-8 items-start gap-4">
      <div className="grid grid-cols-[1fr_auto] items-center">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-16" />
      </div>

      <ItemGroup className="border rounded-lg gap-0">
        {[1, 2].map((i) => (
          <Item key={i} className="last:rounded-b-lg first:rounded-t-lg rounded-none">
            <ItemMedia variant="icon">
              <Skeleton className="size-4" />
            </ItemMedia>
            <ItemContent className="gap-1">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-36" />
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </div>
  );
}
