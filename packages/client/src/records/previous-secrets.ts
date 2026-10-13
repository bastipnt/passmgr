import type { DecryptedRecord, RecordType } from "@repo/schema";
import { toLocalDateStr } from "@repo/util";
import { type FieldSpec, getRecordFieldSpecs } from "./record-field-specs";

const SECRET_KINDS = new Set<FieldSpec["kind"]>(["password", "secret"]);

function secretSpecs(record: DecryptedRecord): Map<string, FieldSpec> {
  return new Map(
    getRecordFieldSpecs(record)
      .filter((spec) => SECRET_KINDS.has(spec.kind) && spec.value)
      .map((spec) => [spec.key, spec]),
  );
}

/**
 * Every value a password or secret field held before it was changed or cleared,
 * newest replacement first. `record` is the version on screen; `history` is its
 * stored revisions newest first (`useRecordHistory`), which may lag behind it or
 * miss revisions that don't decrypt, so the current values come from `record`.
 * Each comes back as a `secret` field spec labelled with the field and the date it
 * was replaced. A value any secret field holds now (also after a custom field was
 * renamed) is left out; one replaced more than once is listed once, at its latest
 * replacement.
 */
export function previousSecrets(record: DecryptedRecord, history: DecryptedRecord[]): FieldSpec[] {
  const current = secretSpecs(record);
  const currentValues = new Set([...current.values()].map((spec) => spec.value));

  const seen = new Set<string>();
  const previous: FieldSpec[] = [];
  let newer = record;
  let newerSpecs = current;

  for (const version of history) {
    if (version.version >= record.version) continue;
    const older = secretSpecs(version);

    for (const [key, spec] of older) {
      if (newerSpecs.get(key)?.compare === spec.compare) continue;
      if (currentValues.has(spec.value)) continue;
      const id = `${key}\u0000${spec.compare}`;
      if (seen.has(id)) continue;
      seen.add(id);
      previous.push({
        ...spec,
        key: `${key}@${version.version}`,
        kind: "secret",
        label: `${spec.label} · until ${toLocalDateStr(newer.clientUpdatedAt)}`,
      });
    }
    newer = version;
    newerSpecs = older;
  }

  return previous;
}

export function previousSecretsTitle(type: RecordType): string {
  return type === "login" || type === "wifi" ? "Previous passwords" : "Previous secrets";
}
