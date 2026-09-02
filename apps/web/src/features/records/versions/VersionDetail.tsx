import { useRecordHistory } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { Skeleton } from "@repo/ui/components/Skeleton";
import { ChevronLeftIcon } from "lucide-react";
import { Link } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { LoginRecordFields } from "../login/LoginRecordFields";

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

      <div className="flex flex-row gap-4">
        <div className="flex flex-1 flex-col gap-4">
          {/* Read-only history: copying from an old revision is not offered. */}
          <LoginRecordFields record={record} onCopy={() => {}} />
        </div>

        <div className="flex flex-1 flex-col gap-4">
          <LoginRecordFields record={latestRecord} onCopy={() => {}} />
        </div>
      </div>
    </div>
  );
}
