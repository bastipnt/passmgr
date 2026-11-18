import { getRecordSubtitle, useRecordVault } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { Badge } from "@repo/ui/components/Badge";
import Link from "@repo/ui/components/Link";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import type { ReactNode } from "react";
import { Link as WouterLink } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { RecordItemSummary } from "@/features/records";

type MonitorAction = "change-password" | "edit";

/**
 * A record a finding names: opens the record; the reason it's listed as a red pill;
 * `action` fixes it (Change: the edit with the generator open). Phones stack the pill and the button.
 */
export function MonitorRecordItem({
  record,
  reason,
  action,
}: {
  record: DecryptedRecord;
  reason?: ReactNode;
  action?: MonitorAction;
}) {
  const { writable } = useRecordVault(record);
  const isMobile = useIsMobile();
  const fix = action && writable && (
    <Link
      size={isMobile ? "sm" : "default"}
      href={
        action === "change-password"
          ? recordPaths.changePassword(record.recordId)
          : recordPaths.editRecord(record.recordId)
      }
      aria-label={`${action === "change-password" ? "Change" : "Edit"} ${record.title}`}
    >
      {action === "change-password" ? "Change" : "Edit"}
    </Link>
  );

  return (
    <div className="group/item flex min-h-16 items-center gap-4 px-5 py-3 text-sm max-sm:flex-col max-sm:items-stretch max-sm:gap-2.5 max-sm:px-4 max-sm:py-3.5">
      <WouterLink
        href={recordPaths.record(record.recordId)}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RecordItemSummary record={record} detail={getRecordSubtitle(record) || "—"} />
      </WouterLink>
      {(reason != null || fix) && (
        <div className="flex shrink-0 items-center gap-2 max-sm:shrink">
          {reason != null && (
            <Badge
              variant="destructive"
              className="h-auto min-h-5 whitespace-normal py-0.75 text-left max-sm:flex-1 max-sm:justify-start"
            >
              {reason}
            </Badge>
          )}
          {fix}
        </div>
      )}
    </div>
  );
}
