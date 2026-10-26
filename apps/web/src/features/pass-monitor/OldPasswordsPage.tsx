import { passwordLastChangedLabel, usePassMonitor } from "@repo/client";
import { ItemGroup } from "@repo/ui/components/Item";
import { MonitorPage } from "./MonitorPage";
import { MonitorRecordItem } from "./MonitorRecordItem";

export default function OldPasswordsPage() {
  const { old } = usePassMonitor();

  return (
    <MonitorPage
      title="Old passwords"
      description="These passwords haven't changed in a year or longer."
      count={old?.length}
      empty="No old passwords."
    >
      <ItemGroup>
        {old?.map(({ record, ageDays }) => (
          <MonitorRecordItem
            key={record.recordId}
            record={record}
            detail={passwordLastChangedLabel(ageDays)}
          />
        ))}
      </ItemGroup>
    </MonitorPage>
  );
}
