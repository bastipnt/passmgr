import { MonitorGroups } from "./MonitorGroups";
import { MonitorPage, useChangeFootnote } from "./MonitorPage";
import { useMonitor } from "./PassMonitorContext";

export default function ReusedPasswordsPage() {
  const { reused } = useMonitor();
  const changeFootnote = useChangeFootnote(reused?.flatMap((group) => group.records));

  return (
    <MonitorPage
      title="Reused passwords"
      description="One leak exposes every place a password is used. Give each one its own."
      count={reused?.length}
      empty="Every password is unique."
      footnote={changeFootnote}
    >
      {reused && (
        <MonitorGroups
          groups={reused}
          heading={(group) => `Used in ${group.records.length} places`}
          action="change-password"
        />
      )}
    </MonitorPage>
  );
}
