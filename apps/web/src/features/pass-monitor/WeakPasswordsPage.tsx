import { usePassMonitor } from "@repo/client";
import { ItemGroup } from "@repo/ui/components/Item";
import { MonitorPage } from "./MonitorPage";
import { MonitorRecordItem } from "./MonitorRecordItem";

export default function WeakPasswordsPage() {
  const { weak, weakFailed } = usePassMonitor();

  return (
    <MonitorPage
      title="Weak passwords"
      description="These passwords are easy to guess. Replace them with generated ones."
      count={weak?.length}
      empty="No weak passwords."
      error={
        weakFailed ? "The strength check couldn't load. Reload the page to try again." : undefined
      }
    >
      <ItemGroup>
        {weak?.map(({ record, strength }) => (
          <MonitorRecordItem
            key={record.recordId}
            record={record}
            detail={strength.warning ? `${strength.label}: ${strength.warning}` : strength.label}
          />
        ))}
      </ItemGroup>
    </MonitorPage>
  );
}
