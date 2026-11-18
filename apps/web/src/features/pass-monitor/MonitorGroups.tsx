import type { MonitorGroup } from "@repo/client";
import { MonitorList } from "./MonitorPage";
import { MonitorRecordItem } from "./MonitorRecordItem";

/** Records grouped by what they share; the heading never shows the shared value. */
export function MonitorGroups({
  groups,
  heading,
  action,
}: {
  groups: MonitorGroup[];
  heading: (group: MonitorGroup) => string;
  action?: "change-password";
}) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.id} className="flex flex-col gap-2">
          <h3 className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-[0.06em] max-sm:px-4">
            {heading(group)}
          </h3>
          <MonitorList>
            {group.records.map((record) => (
              <MonitorRecordItem key={record.recordId} record={record} action={action} />
            ))}
          </MonitorList>
        </section>
      ))}
    </div>
  );
}
