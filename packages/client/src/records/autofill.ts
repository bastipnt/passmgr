import type { DecryptedRecord } from "@repo/schema";
import { isRecordType } from "@repo/schema";
import type { AutofillEntry } from "@repo/store";
import { loginHosts } from "./login-hosts";

/** The logins the OS autofill offers: every one with a password, by title. */
export function autofillEntries(records: readonly DecryptedRecord[]): AutofillEntry[] {
  return records
    .flatMap((record) =>
      isRecordType(record, "login") && record.password
        ? [
            {
              recordId: record.recordId,
              title: record.title,
              username: record.username ?? "",
              password: record.password,
              hosts: [...new Set(loginHosts(record))],
            },
          ]
        : [],
    )
    .sort((a, b) => a.title.localeCompare(b.title));
}
