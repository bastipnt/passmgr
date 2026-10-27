import { type DecryptedRecord, isRecordType, type RecordData } from "@repo/schema";

/** The password the pass monitor checks: a login's or a Wi-Fi network's, if set. */
export function monitoredPassword(record: RecordData): string | undefined {
  if (!isRecordType(record, "login") && !isRecordType(record, "wifi")) return undefined;
  return record.password || undefined;
}

export type PasswordHealth = {
  /** Other records that use the exact same password. */
  reusedIn: DecryptedRecord[];
};

/** Health of a login's or Wi-Fi's password across every vault; `null` when it has none. */
export function getPasswordHealth(
  record: DecryptedRecord,
  allRecords: DecryptedRecord[],
): PasswordHealth | null {
  const password = monitoredPassword(record);
  if (!password) return null;
  return {
    reusedIn: allRecords.filter(
      (other) => other.recordId !== record.recordId && monitoredPassword(other) === password,
    ),
  };
}
