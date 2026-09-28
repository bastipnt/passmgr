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

// Unchanged rows recede; diffs get a tinted card in their status colour.
const CELL_CLASS: Record<DiffStatus, { old: string; latest: string }> = {
  unchanged: { old: "hidden opacity-55 sm:block", latest: "opacity-55" },
  edited: {
    old: "border-warning bg-warning/8 dark:border-warning/50",
    latest: "border-warning bg-warning/8 dark:border-warning/50",
  },
  added: { old: "", latest: "border-success bg-success/10 dark:border-success/50" },
  removed: { old: "border-error bg-error/10 dark:border-error/50", latest: "" },
};

const STATUS_LABEL: Record<DiffStatus, string> = {
  unchanged: "",
  edited: "Changed",
  added: "Added",
  removed: "Removed",
};

const STATUS_TEXT_CLASS: Record<DiffStatus, string> = {
  unchanged: "",
  edited: "text-amber-700 dark:text-warning",
  added: "text-emerald-700 dark:text-success",
  removed: "text-error",
};

const SIDE_CAPTION: Record<"old" | "latest", string> = {
  old: "Before",
  latest: "After",
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
    return (
      <div
        aria-hidden
        className="hidden min-h-16 rounded-2xl border border-foreground/15 border-dashed sm:block dark:border-white/15"
      />
    );
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

function VersionHeading({ record, isCurrent }: { record: DecryptedRecord; isCurrent: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 px-1">
      <h3 className="font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
        {isCurrent ? "Current version" : `Version ${record.version}`}
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

  if (!ready) return <Skeleton className="m-7 h-40 rounded-2xl" />;

  // Newest first, so the revision this one replaced sits right after it.
  const index = versions.findIndex((v) => v.version === version);
  const record = versions[index];
  const previousRecord = versions[index + 1];

  if (!record) {
    return <p className="p-4 text-muted-foreground text-sm">This version no longer exists.</p>;
  }
  if (!previousRecord) {
    return (
      <p className="p-4 text-muted-foreground text-sm">
        This is the first version, there is nothing earlier to compare it with.
      </p>
    );
  }

  const rows = alignFieldSpecs(
    getLoginFieldSpecs(previousRecord, { includeTitle: true }),
    getLoginFieldSpecs(record, { includeTitle: true }),
  );

  return (
    <div className="flex flex-col justify-stretch gap-4 px-5 py-6 sm:px-7">
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={recordPaths.recordVersions(recordId)} />}
        >
          <ChevronLeftIcon /> All versions
        </Button>
        <p className="text-muted-foreground text-xs">Unchanged fields are dimmed</p>
      </div>

      <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:items-start sm:gap-x-4">
        {/* `sm:contents` dissolves these wrappers back into grid cells, so the
            stacked layout can group a row without changing the grid. */}
        <div className="flex flex-row items-start justify-between gap-4 sm:contents">
          <VersionHeading record={previousRecord} isCurrent={false} />
          <VersionHeading record={record} isCurrent={index === 0} />
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
