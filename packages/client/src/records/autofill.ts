import type { DecryptedRecord, LoginRecord } from "@repo/schema";
import { isRecordType, loginRecordSchema, MAX_FIELD_LENGTH, MAX_TITLE_LENGTH } from "@repo/schema";
import {
  type AutofillEntry,
  hasPendingAutofillLogins,
  type PendingAutofillLogin,
  readPendingAutofillLogins,
  removePendingAutofillLogins,
} from "@repo/store";
import { parseWebsite } from "@repo/util";
import type { ImportEntry } from "../export/import-export";
import { loginHosts } from "./login-hosts";
import type { RecordRepository } from "./record-repository";
import { loginAccountName } from "./record-summary";
import { newLoginValues } from "./shared-login";

/** The logins the OS autofill offers: every one with a password, by title. */
export function autofillEntries(records: readonly DecryptedRecord[]): AutofillEntry[] {
  return records
    .flatMap((record) =>
      isRecordType(record, "login") && record.password
        ? [
            {
              recordId: record.recordId,
              title: record.title,
              username: loginAccountName(record) ?? "",
              password: record.password,
              hosts: [...new Set(loginHosts(record))],
            },
          ]
        : [],
    )
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * A login created in the OS autofill as the record it becomes. Its password is already in use
 * on the site, so the rest is cut to fit rather than lost; `undefined` only for a password over
 * the limit.
 */
export function pendingLoginData(pending: PendingAutofillLogin): LoginRecord | undefined {
  const website = pending.website.trim();
  const websiteValues = parseWebsite(website) ? newLoginValues(website) : {};
  const parsed = loginRecordSchema.safeParse({
    type: "login",
    title: (pending.title.trim() || websiteValues.title || "Login").slice(0, MAX_TITLE_LENGTH),
    username: pending.username.slice(0, MAX_FIELD_LENGTH) || undefined,
    password: pending.password,
    passwordChangedAt: pending.createdAt,
    websites: websiteValues.websites,
  });
  return parsed.success ? parsed.data : undefined;
}

/**
 * Saves the profile's logins created in the OS autofill into `vaultId`, then drops them from
 * the device. Keeps their ids, so after a crash before the drop a second run skips them.
 * Resolves how many were written; asks for biometrics only when there are any.
 */
export async function importPendingAutofillLogins(
  records: RecordRepository,
  profileId: string,
  vaultId: string,
): Promise<number> {
  if (!(await hasPendingAutofillLogins(profileId))) return 0;
  const pending = await readPendingAutofillLogins(profileId);
  const known = new Set((await records.heads()).map((head) => head.recordId));
  const entries = pending.flatMap((login): ImportEntry[] => {
    const recordId = login.id.toLowerCase();
    const data = pendingLoginData(login);
    if (!data) console.error("A login created in autofill is invalid and was dropped");
    return data && !known.has(recordId) ? [{ kind: "create", recordId, vaultId, data }] : [];
  });
  await records.writeImport(entries);
  await removePendingAutofillLogins(
    profileId,
    pending.map((login) => login.id),
  );
  return entries.length;
}
