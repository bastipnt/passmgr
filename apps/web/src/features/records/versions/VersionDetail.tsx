import {
  alignFieldSpecs,
  type DiffStatus,
  type FieldSpec,
  getRecordFieldSpecs,
  useRecordHistory,
} from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { ItemDisplayGroup } from "@repo/ui/complex-components/ItemDisplay";
import { Skeleton } from "@repo/ui/components/Skeleton";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import { toLocalDateStr } from "@repo/util";
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
  spec: FieldSpec | undefined;
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

/** The opened revision and the one it replaced (newest first, so right after it). */
function useVersionPair(recordId: string, version: number) {
  const { versions, ready } = useRecordHistory(recordId);
  const index = versions.findIndex((v) => v.version === version);
  return {
    ready,
    record: versions[index],
    previousRecord: versions[index + 1],
    isCurrent: index === 0,
  };
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

/**
 * "Version n ↔ version n+1" labels over the two diff columns. On phones they
 * ride in the drawer's action bar; the sheet pins them under its header.
 */
export function VersionHeadings({
  recordId,
  version,
  className,
}: {
  recordId: string;
  version: number;
  className?: string;
}) {
  const { record, previousRecord, isCurrent } = useVersionPair(recordId, version);
  if (!record || !previousRecord) return null;

  return (
    <div className={cn("grid grid-cols-2 gap-x-4", className)}>
      <VersionHeading record={previousRecord} isCurrent={false} />
      <VersionHeading record={record} isCurrent={isCurrent} />
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
  const isMobile = useIsMobile();
  const { ready, record, previousRecord } = useVersionPair(recordId, version);

  if (!ready) return <Skeleton className="m-7 h-40 rounded-2xl" />;

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
    getRecordFieldSpecs(previousRecord, { includeTitle: true }),
    getRecordFieldSpecs(record, { includeTitle: true }),
  );

  return (
    <div className="flex flex-col justify-stretch gap-4 px-5 pb-6 sm:px-7">
      <p className="pt-6 text-muted-foreground text-xs">Unchanged fields are dimmed</p>

      {!isMobile && (
        <VersionHeadings
          recordId={recordId}
          version={version}
          className="sticky-bar sticky-bar-popover top-(--sheet-header-h)! -mx-7 px-7 py-3"
        />
      )}

      <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:items-start sm:gap-x-4">
        {/* `sm:contents` dissolves these wrappers back into grid cells, so the
            stacked layout can group a row without changing the grid. */}
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
