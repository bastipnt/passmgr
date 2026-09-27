import { useRecordHistory } from "@repo/client";
import { Badge } from "@repo/ui/components/Badge";
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
import { cn } from "@repo/ui/lib/utils";
import { toLocalDateStr } from "@repo/util";
import { ChevronRightIcon, ClockCheckIcon, PencilIcon, SparklesIcon } from "lucide-react";
import { Link } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { describeVersionChanges, type VersionChange } from "./version-changes";

const CHANGE_BADGE: Record<VersionChange["status"], "warning" | "success" | "destructive"> = {
  edited: "warning",
  added: "success",
  removed: "destructive",
};

export default function VersionList({ recordId }: { recordId: string }) {
  const { versions, ready, error } = useRecordHistory(recordId);

  if (error) {
    return <p className="px-7 py-6 text-destructive text-sm">Could not load version history.</p>;
  }

  if (!ready) {
    return (
      <ItemGroup className="gap-3 px-5 py-6 sm:px-7">
        {Array.from({ length: 4 }).map((_, i) => (
          <Item key={i} className="p-0">
            <ItemMedia className="self-stretch! flex flex-col justify-start">
              <Skeleton className="mt-1 size-9 rounded-full" />
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
    <ItemGroup className="gap-3 px-5 py-6 sm:px-7">
      {versions.map((version, i) => {
        const isCurrent = i === 0;
        const isOldest = i === versions.length - 1;
        const changes = describeVersionChanges(version, versions[i + 1]);

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
              <div
                className={cn(
                  "mt-1 grid size-9 place-items-center rounded-full border",
                  isCurrent
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-foreground/12 bg-white/70 text-muted-foreground dark:border-white/12 dark:bg-white/5",
                )}
              >
                {icon}
              </div>
              {!isOldest && <div className="-mb-4 w-px flex-1 bg-foreground/12 dark:bg-white/12" />}
            </ItemMedia>
            <ItemContent>
              <Item
                variant={isCurrent ? "active" : "outline"}
                className="rounded-2xl px-4 py-3.5"
                render={<Link href={recordPaths.version(recordId, version.version)} />}
              >
                <ItemContent className="gap-1">
                  <ItemTitle className="font-semibold text-[0.95rem]">
                    {versionName}
                    {isCurrent && (
                      <Badge variant="secondary" className="h-5 text-[0.65rem] tracking-wider">
                        NOW
                      </Badge>
                    )}
                  </ItemTitle>
                  <ItemDescription>{toLocalDateStr(version.clientUpdatedAt)}</ItemDescription>
                  {changes.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Changes">
                      {changes.map((change) => (
                        <li key={change.key}>
                          <Badge variant={CHANGE_BADGE[change.status]}>{change.label}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
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
