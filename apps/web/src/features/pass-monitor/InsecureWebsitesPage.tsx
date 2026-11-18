import { MonitorList, MonitorPage } from "./MonitorPage";
import { MonitorRecordItem } from "./MonitorRecordItem";
import { useMonitor } from "./PassMonitorContext";

export default function InsecureWebsitesPage() {
  const { insecure } = useMonitor();

  return (
    <MonitorPage
      title="Insecure websites"
      description="These logins are for websites on plain HTTP, which sends what you type unencrypted. Switch them to https:// if the site supports it."
      count={insecure?.length}
      empty="Every website uses HTTPS."
    >
      <MonitorList>
        {insecure?.map(({ record, hosts }) => (
          <MonitorRecordItem
            key={record.recordId}
            record={record}
            reason={hosts.map((host) => `http://${host}`).join(", ")}
            action="edit"
          />
        ))}
      </MonitorList>
    </MonitorPage>
  );
}
