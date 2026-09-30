import type { DecryptedRecord } from "@repo/schema";
import { alignFieldSpecs, type DiffStatus } from "./diff-fields";
import { getLoginFieldSpecs, type LoginFieldSpec } from "./login-field-specs";

export type VersionChange = {
  key: string;
  label: string;
  status: Exclude<DiffStatus, "unchanged">;
};

const STATUS_WORD: Record<VersionChange["status"], string> = {
  edited: "changed",
  added: "added",
  removed: "removed",
};

// Tag-sized names; extra fields keep their own title.
const SHORT_NAME: Partial<Record<LoginFieldSpec["kind"], string>> = {
  title: "Title",
  username: "Username",
  password: "Password",
  totp: "2FA",
  websites: "Website",
  note: "Note",
};

/**
 * What changed from `previous` to `version`, as short tags ("Password changed",
 * "2FA added"). Empty for the first version, which has nothing to compare to.
 */
export function describeVersionChanges(
  version: DecryptedRecord,
  previous: DecryptedRecord | undefined,
): VersionChange[] {
  if (!previous) return [];

  const rows = alignFieldSpecs(
    getLoginFieldSpecs(previous, { includeTitle: true }),
    getLoginFieldSpecs(version, { includeTitle: true }),
  );

  return rows.flatMap((row) => {
    if (row.status === "unchanged") return [];
    const spec = row.latest ?? row.old;
    if (!spec) return [];
    const name = SHORT_NAME[spec.kind] ?? spec.label;
    return [{ key: row.key, status: row.status, label: `${name} ${STATUS_WORD[row.status]}` }];
  });
}
