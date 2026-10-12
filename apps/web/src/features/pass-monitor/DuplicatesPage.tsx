import { usePassMonitor } from "@repo/client";
import { MonitorGroups } from "./MonitorGroups";
import { MonitorPage } from "./MonitorPage";

export default function DuplicatesPage() {
  const { duplicates } = usePassMonitor();

  return (
    <MonitorPage
      title="Duplicates"
      description="Logins with the same username on the same website. Keep one and delete the others."
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
