import { useRecordHistory } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { ItemDisplayGroup } from "@repo/ui/complex-components/ItemDisplay";
import { Button } from "@repo/ui/components/Button";
import { Skeleton } from "@repo/ui/components/Skeleton";
import { toLocalDateStr } from "@repo/util";
import { ChevronLeftIcon } from "lucide-react";
import { Fragment } from "react";
import { Link } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { getLoginFieldSpecs, type LoginFieldSpec } from "../login/login-field-specs";
import { alignFieldSpecs, type DiffStatus } from "./diff-fields";

/** Copying from a historical revision is not offered. */
const noCopy = () => {};

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

  const label = STATUS_LABEL[status];

  return (
    <div>
      <ItemDisplayGroup className={CELL_CLASS[status][side]}>
        {label && <span className="sr-only">{label}:</span>}
        {spec.render(noCopy)}
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
        <VersionHeading record={record} isLatest={false} />
        <VersionHeading record={latestRecord} isLatest />

        {rows.map((row) => (
          <Fragment key={`${row.status}:${row.key}`}>
            <DiffCell spec={row.old} status={row.status} side="old" />
            <DiffCell spec={row.latest} status={row.status} side="latest" />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
