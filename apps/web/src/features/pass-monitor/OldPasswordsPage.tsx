import { passwordLastChangedLabel } from "@repo/client";
import { MonitorList, MonitorPage, useChangeFootnote } from "./MonitorPage";
import { MonitorRecordItem } from "./MonitorRecordItem";
import { useMonitor } from "./PassMonitorContext";

export default function OldPasswordsPage() {
  const { old } = useMonitor();
  const changeFootnote = useChangeFootnote(old?.map(({ record }) => record));

  return (
    <MonitorPage
      title="Old passwords"
      description="These passwords haven't changed in a year or longer."
      count={old?.length}
      empty="No old passwords."
      footnote={changeFootnote}
    >
      <MonitorList>
        {old?.map(({ record, ageDays }) => (
          <MonitorRecordItem
            key={record.recordId}
            record={record}
            reason={passwordLastChangedLabel(ageDays)}
            action="change-password"
          />
        ))}
      </MonitorList>
    </MonitorPage>
  );
}
