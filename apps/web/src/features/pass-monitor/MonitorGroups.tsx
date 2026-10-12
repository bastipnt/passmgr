import { getRecordSubtitle, type MonitorGroup } from "@repo/client";
import { ItemGroup } from "@repo/ui/components/Item";
import { MonitorRecordItem } from "./MonitorRecordItem";

/** Records grouped by what they share; the heading never shows the shared value. */
export function MonitorGroups({
  groups,
  heading,
}: {
  groups: MonitorGroup[];
  heading: (group: MonitorGroup) => string;
}) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.id} className="flex flex-col gap-2">
          <h3 className="px-1 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
            {heading(group)}
          </h3>
          <ItemGroup>
            {group.records.map((record) => (
              <MonitorRecordItem
                key={record.recordId}
                record={record}
                detail={getRecordSubtitle(record) || "—"}
              />
            ))}
          </ItemGroup>
        </section>
      ))}
    </div>
  );
}
