import type { DecryptedRecord } from "@repo/schema";
import { Item, ItemActions } from "@repo/ui/components/Item";
import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link as WouterLink } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { RecordItemSummary } from "@/features/records";

/** A record a finding names: opens the record. */
export function MonitorRecordItem({
  record,
  detail,
}: {
  record: DecryptedRecord;
  detail: ReactNode;
}) {
  return (
    <Item variant="outline" render={<WouterLink href={recordPaths.record(record.recordId)} />}>
      <RecordItemSummary record={record} detail={detail} />
      <ItemActions>
        <ChevronRightIcon className="size-4" />
      </ItemActions>
    </Item>
  );
}
