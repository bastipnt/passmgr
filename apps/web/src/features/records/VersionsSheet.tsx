import { ShortcutLayer, useRecordHistory } from "@repo/client";
import { ResponsiveSheet } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/Item";
import { Skeleton } from "@repo/ui/components/Skeleton";
import { toLocalDateStr } from "@repo/util";
import { ChevronLeftIcon, Timeline } from "lucide-react";
import { Link } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { LoginRecordFields } from "./login/LoginRecordFields";
import { useRouteSheet } from "./use-route-sheet";

type VersionsRouteParams = { recordId: string; version?: string };

function VersionList({ recordId }: { recordId: string }) {
  const { versions, ready, error } = useRecordHistory(recordId);

  if (error) {
    return <p className="p-4 text-destructive text-sm">Could not load version history.</p>;
  }

  if (!ready) {
    return (
      <ItemGroup className="p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          // static skeleton list, index key is fine
          <Item key={i} variant="outline">
            <ItemContent className="gap-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40" />
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    );
  }

  return (
    <ItemGroup className="p-4">
      {versions.map((version, i) => (
        <Item
          key={version.version}
          variant="outline"
          render={<Link href={recordPaths.version(recordId, version.version)} />}
        >
          <ItemMedia>
            <Timeline className="size-4" />
          </ItemMedia>
          <ItemContent className="gap-1">
            <ItemTitle>
              Version {version.version}
              {i === 0 && <span className="ml-2 text-muted-foreground text-xs">current</span>}
            </ItemTitle>
            <ItemDescription>{toLocalDateStr(version.clientUpdatedAt)}</ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}

function VersionDetail({ recordId, version }: { recordId: string; version: number }) {
  const { versions, ready } = useRecordHistory(recordId);
  const record = ready ? versions.find((v) => v.version === version) : undefined;

  if (!ready) return <Skeleton className="m-4 h-40" />;
  if (!record) {
    return <p className="p-4 text-muted-foreground text-sm">This version no longer exists.</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Button
        variant="ghost"
        className="self-start"
        nativeButton={false}
        render={<Link href={recordPaths.recordVersions(recordId)} />}
      >
        <ChevronLeftIcon /> All versions
      </Button>

      {/* Read-only history: copying from an old revision is not offered. */}
      <LoginRecordFields record={record} onCopy={() => {}} />
    </div>
  );
}

export default function VersionsSheet() {
  const { open, params, setOpen, onOpenChangeComplete } = useRouteSheet<VersionsRouteParams>(
    recordPaths.versions,
    (p) => recordPaths.record(p.recordId),
  );

  const recordId = params?.recordId;
  const version = params?.version ? Number(params.version) : undefined;

  return (
    <ShortcutLayer active={open}>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        onOpenChangeComplete={onOpenChangeComplete}
        title={version ? `Version ${version}` : "Version history"}
      >
        {recordId &&
          (version === undefined ? (
            <VersionList recordId={recordId} />
          ) : (
            <VersionDetail recordId={recordId} version={version} />
          ))}
      </ResponsiveSheet>
    </ShortcutLayer>
  );
}
