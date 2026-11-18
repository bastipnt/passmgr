import { groupedCount } from "@repo/client";
import { passMonitorPaths } from "@/app/route-paths";
import { useBreach, useMonitor } from "./PassMonitorContext";

export type Finding = {
  path: string;
  title: string;
  description: string;
  /** `undefined` while the check runs. */
  count: number | undefined;
  failed?: boolean;
  off?: boolean;
};

/** The checks in the order the list shows them. */
export function useFindings(): Finding[] {
  const { weak, weakFailed, reused, duplicates, old, insecure, missingTwoFactor, twoFactorFailed } =
    useMonitor();
  const breach = useBreach();

  return [
    {
      title: "Weak passwords",
      description: "Easy to guess",
      path: passMonitorPaths.weak,
      count: weak?.length,
      failed: weakFailed,
    },
    {
      title: "Reused passwords",
      description: "The same password in more than one place",
      path: passMonitorPaths.reused,
      count: groupedCount(reused),
    },
    {
      title: "Duplicates",
      description: "The same account saved more than once",
      path: passMonitorPaths.duplicates,
      count: groupedCount(duplicates),
    },
    {
      title: "Old passwords",
      description: "Unchanged for a year or longer",
      path: passMonitorPaths.old,
      count: old?.length,
    },
    {
      title: "Breached passwords",
      description:
        breach.enabled === false
          ? "Check against known data breaches"
          : "Found in known data breaches",
      path: passMonitorPaths.breached,
      count: breach.breached?.length,
      failed: breach.breached === null && !breach.checking && (breach.failed || breach.offline),
      off: breach.enabled === false,
    },
    {
      title: "Insecure websites",
      description: "Logins on plain HTTP",
      path: passMonitorPaths.insecure,
      count: insecure?.length,
    },
    {
      title: "Missing 2FA",
      description: "Sites that offer two-factor authentication",
      path: passMonitorPaths.twoFactor,
      count: missingTwoFactor?.length,
      failed: twoFactorFailed,
    },
  ];
}

/**
 * What the desktop opens on: the first finding with something to fix, else the first. A check
 * still running holds the choice, so a slow one finishing later never pulls the pane back to it.
 */
export function defaultFindingPath(findings: readonly Finding[]): string {
  for (const finding of findings) {
    if (finding.off || finding.failed) continue;
    if (finding.count === undefined || finding.count > 0) return finding.path;
  }
  return findings[0].path;
}
