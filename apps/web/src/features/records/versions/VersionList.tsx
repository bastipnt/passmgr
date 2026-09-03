import { useRecordHistory } from "@repo/client";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/Item";
import { Skeleton } from "@repo/ui/components/Skeleton";
import { toLocalDateStr } from "@repo/util";
import { ChevronRightIcon, ClockCheckIcon, PencilIcon, SparklesIcon } from "lucide-react";
import { Link } from "wouter";
import { recordPaths } from "@/app/route-paths";

export default function VersionList({ recordId }: { recordId: string }) {
  const { versions, ready, error } = useRecordHistory(recordId);

  if (error) {
    return <p className="p-4 text-destructive text-sm">Could not load version history.</p>;
  }

  if (!ready) {
    return (
      <ItemGroup className="p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Item key={i} className="p-0">
            <ItemMedia className="self-stretch! flex flex-col justify-start">
              <Skeleton className="mt-1 h-8 w-8 rounded-full" />
              {i < 3 && <div className="-mb-3 w-0.5 flex-1 bg-border"></div>}
            </ItemMedia>
            <ItemContent>
              <Item variant="outline">
                <ItemContent className="gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-40" />
                </ItemContent>
              </Item>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    );
  }

  return (
    <ItemGroup className="p-4">
      {versions.map((version, i) => {
        const isCurrent = i === 0;
        const isOldest = i === versions.length - 1;

        const versionName = isCurrent ? "Current version" : isOldest ? "Created" : "Modified";
        const icon = isCurrent ? (
          <ClockCheckIcon className="size-4" />
        ) : isOldest ? (
          <SparklesIcon className="size-4" />
        ) : (
          <PencilIcon className="size-4" />
        );

        return (
          <Item key={version.version} className="p-0">
            <ItemMedia className="self-stretch! flex flex-col justify-start gap-2">
              <div className="mt-1 rounded-full bg-primary p-2">{icon}</div>
              {!isOldest && <div className="-mb-3 w-0.5 flex-1 bg-border"></div>}
            </ItemMedia>
            <ItemContent>
              <Item
                variant="outline"
                render={<Link href={recordPaths.version(recordId, version.version)} />}
              >
                <ItemContent className="gap-1">
                  <ItemTitle>{versionName}</ItemTitle>
                  <ItemDescription>{toLocalDateStr(version.clientUpdatedAt)}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ChevronRightIcon className="size-4" />
                </ItemActions>
              </Item>
            </ItemContent>
          </Item>
        );
      })}
    </ItemGroup>
  );
}
