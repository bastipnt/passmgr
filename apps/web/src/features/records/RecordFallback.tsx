import { Item, ItemContent, ItemGroup, ItemMedia } from "@repo/ui/components/Item";
import { Skeleton } from "@repo/ui/components/Skeleton";

export function RecordFallback() {
  return (
    <div className="grid grid-cols-1 items-start gap-6 p-6 lg:p-7">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
        <Skeleton className="size-14 rounded-2xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-10 w-20 rounded-lg" />
      </div>

      <ItemGroup className="gap-0 rounded-2xl border border-foreground/10 dark:border-white/10">
        {[1, 2].map((i) => (
          <Item key={i} className="rounded-none first:rounded-t-2xl last:rounded-b-2xl">
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
