import { usePassMonitor } from "@repo/client";
import { MonitorGroups } from "./MonitorGroups";
import { MonitorPage } from "./MonitorPage";

export default function ReusedPasswordsPage() {
  const { reused } = usePassMonitor();

  return (
    <MonitorPage
      title="Reused passwords"
      description="One leak exposes every place a password is used. Give each one its own."
      count={reused?.length}
      empty="Every password is unique."
    >
      {reused && (
        <MonitorGroups
          groups={reused}
          heading={(group) => `Used in ${group.records.length} places`}
        />
      )}
    </MonitorPage>
  );
}
