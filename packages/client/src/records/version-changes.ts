import type { DecryptedRecord } from "@repo/schema";
import { alignFieldSpecs, type DiffStatus } from "./diff-fields";
import { type FieldSpec, getRecordFieldSpecs } from "./record-field-specs";

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

// Tag-sized names; every other field keeps its own label.
const SHORT_NAME: Partial<Record<FieldSpec["kind"], string>> = {
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
    getRecordFieldSpecs(previous, { includeTitle: true }),
    getRecordFieldSpecs(version, { includeTitle: true }),
  );

  const changes = rows.flatMap((row): VersionChange[] => {
    if (row.status === "unchanged") return [];
    const spec = row.latest ?? row.old;
    if (!spec) return [];
    const name = SHORT_NAME[spec.kind] ?? spec.label;
    return [{ key: row.key, status: row.status, label: `${name} ${STATUS_WORD[row.status]}` }];
  });
  return [...changes, ...favoriteChange(version, previous)];
}

// Not a field spec (no view renders it as a field), so compared on its own.
function favoriteChange(version: DecryptedRecord, previous: DecryptedRecord): VersionChange[] {
  if (Boolean(version.favorite) === Boolean(previous.favorite)) return [];
  return version.favorite
    ? [{ key: "favorite", status: "added", label: "Added to favorites" }]
    : [{ key: "favorite", status: "removed", label: "Removed from favorites" }];
}
