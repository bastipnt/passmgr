import type { DecryptedRecord } from "@repo/schema";
import type { PasswordStrength } from "@repo/util";
import { breachCountLabel } from "./breach-check";
import { isWeakStrength, type OldPassword, passwordLastChangedLabel } from "./pass-monitor";
import type { PasswordHealth } from "./password-health";
import type { TwoFactorSite } from "./two-factor-directory";

export type PasswordIssue =
  | { kind: "breached"; count: number }
  | { kind: "weak"; strength: PasswordStrength }
  | { kind: "reused"; records: DecryptedRecord[] }
  | { kind: "old"; ageDays: number }
  | { kind: "missing-two-factor"; site: TwoFactorSite };

export type PasswordIssueInputs = {
  health: PasswordHealth;
  /** `null` while unrated. */
  strength: PasswordStrength | null;
  /** `null` when the breach check is off or hasn't seen this password. */
  breachCount: number | null;
  old: OldPassword | undefined;
  /** A site offering 2FA when the login has no TOTP secret (`missingTwoFactorOf`). */
  twoFactorSite: TwoFactorSite | undefined;
};

/** The pass monitor's findings about one login's password (websites aside), most urgent first. */
export function passwordIssues({
  health,
  strength,
  breachCount,
  old,
  twoFactorSite,
}: PasswordIssueInputs): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (breachCount) issues.push({ kind: "breached", count: breachCount });
  if (strength && isWeakStrength(strength)) issues.push({ kind: "weak", strength });
  if (health.reusedIn.length > 0) issues.push({ kind: "reused", records: health.reusedIn });
  if (old) issues.push({ kind: "old", ageDays: old.ageDays });
  if (twoFactorSite) issues.push({ kind: "missing-two-factor", site: twoFactorSite });
  return issues;
}

const REUSE_NAMED = 2;

export function passwordIssueTitle(issue: PasswordIssue): string {
  switch (issue.kind) {
    case "breached":
      return "Breached";
    case "weak":
      return `${issue.strength.label} password`;
    case "reused":
      return "Reused";
    case "old":
      return "Old password";
    case "missing-two-factor":
      return "No two-factor code";
  }
}

/** The records a reused password is named by, and how many more there are. */
export function namedReuse(records: readonly DecryptedRecord[]) {
  return { named: records.slice(0, REUSE_NAMED), more: Math.max(0, records.length - REUSE_NAMED) };
}

export function passwordIssueDetail(issue: PasswordIssue): string {
  switch (issue.kind) {
    case "breached":
      return breachCountLabel(issue.count);
    case "weak":
      return issue.strength.warning || "Easy to guess";
    case "reused": {
      const { named, more } = namedReuse(issue.records);
      const titles = named.map((record) => record.title).join(", ");
      return `The same password is saved in ${titles}${more > 0 ? ` +${more}` : ""}`;
    }
    case "old":
      return passwordLastChangedLabel(issue.ageDays);
    case "missing-two-factor":
      return `${issue.site.domain} supports 2FA`;
  }
}
