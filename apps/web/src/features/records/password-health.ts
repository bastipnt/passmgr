import { getStrengthFromString } from "@repo/crypto";
import { type DecryptedRecord, isRecordType } from "@repo/schema";
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
  if (!isRecordType(record, "login") || !record.password) return null;
  const logins = allRecords.filter((other) => isRecordType(other, "login"));

  return {
    strength: getStrengthFromString(record.password),
    reusedIn: logins.filter(
      (other) => other.recordId !== record.recordId && other.password === record.password,
    ),
    checkedCount: logins.length,
    hasTotp: !!record.totp,
  };
}
