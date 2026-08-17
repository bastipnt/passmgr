import { Item, ItemContent, ItemGroup, ItemMedia } from "@repo/ui/components/Item";
import { Skeleton } from "@repo/ui/components/Skeleton";

export function RecordFallback() {
  return (
    <div className="grid grid-cols-1 items-start gap-4 p-8">
      <div className="grid grid-cols-[1fr_auto] items-center">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-16" />
      </div>

      <ItemGroup className="gap-0 rounded-lg border">
        {[1, 2].map((i) => (
          <Item key={i} className="rounded-none first:rounded-t-lg last:rounded-b-lg">
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
