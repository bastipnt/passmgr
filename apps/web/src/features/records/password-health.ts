import { getStrengthFromString } from "@repo/crypto";
import type { DecryptedRecord } from "@repo/schema";
import type { PasswordStrength } from "@repo/util";

export type PasswordHealth = {
  strength: PasswordStrength;
  /** Other logins that use the exact same password. */
  reusedIn: DecryptedRecord[];
  /** How many logins (including this one) the reuse check looked at. */
  checkedCount: number;
  hasTotp: boolean;
};

/** Health of a login's password within the vault; `null` when it has none. */
export function getPasswordHealth(
  record: DecryptedRecord,
  allRecords: DecryptedRecord[],
): PasswordHealth | null {
  if (!record.password) return null;

  return {
    strength: getStrengthFromString(record.password),
    reusedIn: allRecords.filter(
      (other) => other.recordId !== record.recordId && other.password === record.password,
    ),
    checkedCount: allRecords.length,
    hasTotp: !!record.totp,
  };
}
