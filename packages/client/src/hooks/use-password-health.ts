import type { DecryptedRecord } from "@repo/schema";
import type { PasswordStrength } from "@repo/util";
import { useMemo } from "react";
import { oldPasswordOf, strengthInputs } from "../records/pass-monitor";
import { getPasswordHealth, monitoredPassword } from "../records/password-health";
import { type PasswordIssue, passwordIssues } from "../records/password-issues";
import { useStoredBreachCount } from "./use-breach-check";
import { usePasswordStrength } from "./use-password-strength";
import { useGetRecords } from "./use-records";
import { useMissingTwoFactor } from "./use-two-factor-directory";

export type PasswordHealthSummary = {
  strength: PasswordStrength | null;
  breachCount: number | null;
  issues: PasswordIssue[];
};

/** A login's or Wi-Fi's password health for its detail; `null` for a record without one. */
export function usePasswordHealth(record: DecryptedRecord): PasswordHealthSummary | null {
  const { records } = useGetRecords();
  const health = useMemo(() => getPasswordHealth(record, records), [record, records]);
  const strength = usePasswordStrength(monitoredPassword(record), strengthInputs(record));
  const breachCount = useStoredBreachCount(record);
  const twoFactorSite = useMissingTwoFactor(record);

  return useMemo(() => {
    if (!health) return null;
    const old = oldPasswordOf(record);
    return {
      strength,
      breachCount,
      issues: passwordIssues({ health, strength, breachCount, old, twoFactorSite }),
    };
  }, [record, health, strength, breachCount, twoFactorSite]);
}
