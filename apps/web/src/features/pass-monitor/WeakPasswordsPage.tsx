import { MonitorList, MonitorPage, useChangeFootnote } from "./MonitorPage";
import { MonitorRecordItem } from "./MonitorRecordItem";
import { useMonitor } from "./PassMonitorContext";

export default function WeakPasswordsPage() {
  const { weak, weakFailed } = useMonitor();
  const changeFootnote = useChangeFootnote(weak?.map(({ record }) => record));

  return (
    <MonitorPage
      title="Weak passwords"
      description="These passwords are easy to guess. Replace them with generated ones."
      count={weak?.length}
      empty="No weak passwords."
      footnote={changeFootnote}
      error={
        weakFailed ? "The strength check couldn't load. Reload the page to try again." : undefined
      }
    >
      <MonitorList>
        {weak?.map(({ record, strength }) => (
          <MonitorRecordItem
            key={record.recordId}
            record={record}
            reason={strength.warning ? `${strength.label}: ${strength.warning}` : strength.label}
            action="change-password"
          />
        ))}
      </MonitorList>
    </MonitorPage>
  );
}
