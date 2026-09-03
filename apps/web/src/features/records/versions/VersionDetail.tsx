import {
  alignFieldSpecs,
  type DiffStatus,
  getLoginFieldSpecs,
  type LoginFieldSpec,
  useRecordHistory,
} from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { ItemDisplayGroup } from "@repo/ui/complex-components/ItemDisplay";
import { Button } from "@repo/ui/components/Button";
import { Skeleton } from "@repo/ui/components/Skeleton";
import { cn } from "@repo/ui/lib/utils";
import { toLocalDateStr } from "@repo/util";
import { ChevronLeftIcon } from "lucide-react";
import { Link } from "wouter";
import { recordPaths } from "@/app/route-paths";
import LoginFieldDisplay from "../login/LoginFieldDisplay";

const CELL_CLASS: Record<DiffStatus, { old: string; latest: string }> = {
  unchanged: { old: "hidden sm:block", latest: "" },
  edited: { old: "border-warning", latest: "border-warning" },
  added: { old: "", latest: "border-success bg-success/10" },
  removed: { old: "border-error bg-error/10", latest: "" },
};

const STATUS_LABEL: Record<DiffStatus, string> = {
  unchanged: "",
  edited: "Changed",
  added: "Added",
  removed: "Removed",
};

const STATUS_TEXT_CLASS: Record<DiffStatus, string> = {
  unchanged: "",
  edited: "text-warning",
  added: "text-success",
  removed: "text-error",
};

const SIDE_CAPTION: Record<"old" | "latest", string> = {
  old: "Before",
  latest: "Now",
};

function DiffCell({
  spec,
  status,
  side,
}: {
  spec: LoginFieldSpec | undefined;
  status: DiffStatus;
  side: "old" | "latest";
}) {
  // Without a spec this side has no such field. The cell still occupies its
  // grid slot so the other side keeps its own row, but it collapses away once
  // the columns stack.
  if (!spec) {
    return <div aria-hidden className="hidden sm:block" />;
  }

  // Stacked, the two revisions read as one column, so each card has to say
  // which one it is. Side by side the column headings already do, and the
  // caption drops back to screen readers.
  const caption = status === "unchanged" ? undefined : SIDE_CAPTION[side];

  return (
    <div>
      {caption && <p className="mb-1 text-muted-foreground text-xs sm:sr-only">{caption}</p>}
      <ItemDisplayGroup className={CELL_CLASS[status][side]}>
        <LoginFieldDisplay spec={spec} />
      </ItemDisplayGroup>
    </div>
  );
}

function VersionHeading({ record, isLatest }: { record: DecryptedRecord; isLatest: boolean }) {
  return (
    <div>
      <h3 className="font-medium text-sm">
        {isLatest ? "Current version" : `Version ${record.version}`}
      </h3>
      <p className="text-muted-foreground text-xs">{toLocalDateStr(record.clientUpdatedAt)}</p>
    </div>
  );
}

export default function VersionDetail({
  recordId,
  version,
}: {
  recordId: string;
  version: number;
}) {
  const { versions, ready } = useRecordHistory(recordId);
  const record = ready ? versions.find((v) => v.version === version) : undefined;
  const latestRecord = ready ? versions[0] : undefined;

  if (!ready) return <Skeleton className="m-4 h-40" />;
  if (!record) {
    return <p className="p-4 text-muted-foreground text-sm">This version no longer exists.</p>;
  }
  if (!latestRecord) {
    return <p className="p-4 text-muted-foreground text-sm">This record no longer exists.</p>;
  }

  const rows = alignFieldSpecs(
    getLoginFieldSpecs(record, { includeTitle: true }),
    getLoginFieldSpecs(latestRecord, { includeTitle: true }),
  );

  return (
    <div className="flex flex-col justify-stretch gap-4 p-4">
      <Button
        variant="ghost"
        className="self-start"
        nativeButton={false}
        render={<Link href={recordPaths.recordVersions(recordId)} />}
      >
        <ChevronLeftIcon /> All versions
      </Button>

      <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:items-start sm:gap-x-4">
        {/* `sm:contents` dissolves these wrappers back into grid cells, so the
            stacked layout can group a row without changing the grid. */}
        <div className="flex flex-row items-start justify-between gap-4 sm:contents">
          <VersionHeading record={record} isLatest={false} />
          <VersionHeading record={latestRecord} isLatest />
        </div>

        {rows.map((row) => (
          <div key={`${row.status}:${row.key}`} className="flex flex-col gap-1.5 sm:contents">
            {STATUS_LABEL[row.status] && (
              <p className={cn("font-medium text-xs sm:sr-only", STATUS_TEXT_CLASS[row.status])}>
                {STATUS_LABEL[row.status]}
              </p>
            )}
            <DiffCell spec={row.old} status={row.status} side="old" />
            <DiffCell spec={row.latest} status={row.status} side="latest" />
          </div>
        ))}
      </div>
    </div>
  );
}
