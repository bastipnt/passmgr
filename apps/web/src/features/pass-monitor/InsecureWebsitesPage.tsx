import { usePassMonitor } from "@repo/client";
import { ItemGroup } from "@repo/ui/components/Item";
import { MonitorPage } from "./MonitorPage";
import { MonitorRecordItem } from "./MonitorRecordItem";

export default function InsecureWebsitesPage() {
  const { insecure } = usePassMonitor();

  return (
    <MonitorPage
      title="Insecure websites"
      description="These logins are for websites on plain HTTP, which sends what you type unencrypted. Switch them to https:// if the site supports it."
      count={insecure?.length}
      empty="Every website uses HTTPS."
    >
      <ItemGroup>
        {insecure?.map(({ record, hosts }) => (
          <MonitorRecordItem
            key={record.recordId}
            record={record}
            detail={hosts.map((host) => `http://${host}`).join(", ")}
          />
        ))}
      </ItemGroup>
    </MonitorPage>
  );
}
