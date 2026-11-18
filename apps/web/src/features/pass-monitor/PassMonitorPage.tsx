import { securityScore } from "@repo/client";
import { FindingsList } from "./FindingsList";
import { useFindings } from "./findings";
import { useBreach, useMonitor } from "./PassMonitorContext";
import { SecurityScoreCard } from "./SecurityScoreCard";

/** The score and every finding: the phone's first page, the desktop's left column. */
export function PassMonitorSummary({ active }: { active?: string }) {
  const monitor = useMonitor();
  const breach = useBreach();
  const findings = useFindings();

  return (
    <>
      <SecurityScoreCard score={securityScore({ ...monitor, breach })} />
      <FindingsList findings={findings} active={active} />
    </>
  );
}

/** Phone: the overview, each finding a pushed page. */
export default function PassMonitorPage() {
  return (
    <div className="flex flex-col gap-7 px-6 pt-3 pb-12">
      <h1 className="px-1 font-bold font-display text-[30px] leading-9">Pass Monitor</h1>
      <PassMonitorSummary />
    </div>
  );
}
