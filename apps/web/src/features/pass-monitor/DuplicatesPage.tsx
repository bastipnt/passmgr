import { MonitorGroups } from "./MonitorGroups";
import { MonitorPage } from "./MonitorPage";
import { useMonitor } from "./PassMonitorContext";

export default function DuplicatesPage() {
  const { duplicates } = useMonitor();

  return (
    <MonitorPage
      title="Duplicates"
      description="Logins with the same username or email on the same website. Keep one and delete the others."
      count={duplicates?.length}
      empty="No duplicate logins."
    >
      {duplicates && (
        <MonitorGroups
          groups={duplicates}
          heading={(group) => `${group.records.length} logins for one account`}
        />
      )}
    </MonitorPage>
  );
}
