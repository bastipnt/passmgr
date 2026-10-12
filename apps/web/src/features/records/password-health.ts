import { type DecryptedRecord, isRecordType } from "@repo/schema";

export type PasswordHealth = {
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
    reusedIn: logins.filter(
      (other) => other.recordId !== record.recordId && other.password === record.password,
    ),
    checkedCount: logins.length,
    hasTotp: !!record.totp,
  };
}
