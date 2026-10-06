import type { RecordData } from "@repo/schema";

/** One version of a record on one side of a merge. */
export type MergeVersion = {
  data: RecordData;
  /** When the edit was made: the version's `clientUpdatedAt`, clamped against clock skew. */
  editedAt: string;
  deleted: boolean;
};

export type MergeResult = { data: RecordData; deleted: boolean };

// Lists of plain strings: an item is its own identity, so they merge per item.
// Websites and custom fields have no stable item ids and count as one field.
const SET_FIELDS = new Set(["tags"]);

/**
 * Three-way, field-level merge of a record edited on two sides (ADR 0001 D5).
 * `local` and `remote` are each side's versions since `base`, oldest first,
 * never empty.
 *
 * - A field changed on one side only takes that side's value.
 * - A field changed on both sides to different values takes the later edit
 *   (`editedAt` of the last version on that side that changed it; a tie goes
 *   to `remote`, the server's copy). Tag lists merge per tag instead.
 * - A record type changed on either side makes the whole record one field:
 *   the side whose head was edited later wins.
 * - Edit vs. delete: the edit wins, so the result is deleted only when both
 *   heads are tombstones. A tombstone keeps the content it deleted, so edits
 *   made before the delete still merge.
 *
 * Fields are a record's payload keys rather than its `getRecordFieldSpecs`:
 * those leave out fields no view renders (favourite, tags) and format values.
 */
export function mergeRecord(
  base: RecordData,
  local: readonly MergeVersion[],
  remote: readonly MergeVersion[],
): MergeResult {
  const localHead = local.at(-1);
  const remoteHead = remote.at(-1);
  if (!localHead || !remoteHead) throw new Error("mergeRecord needs a version on both sides");
  const deleted = localHead.deleted && remoteHead.deleted;

  if (localHead.data.type !== base.type || remoteHead.data.type !== base.type) {
    const winner = isLater(localHead.editedAt, remoteHead.editedAt) ? localHead : remoteHead;
    return { data: winner.data, deleted };
  }

  const localTimes = fieldEditTimes(base, local);
  const remoteTimes = fieldEditTimes(base, remote);
  const baseFields = fieldsOf(base);
  const localFields = fieldsOf(localHead.data);
  const remoteFields = fieldsOf(remoteHead.data);

  const merged: Record<string, unknown> = { type: base.type };
  for (const key of fieldKeys(localHead.data, remoteHead.data, base)) {
    const [b, l, r] = [baseFields[key], localFields[key], remoteFields[key]];
    let value: unknown;
    if (SET_FIELDS.has(key)) value = mergeSet(b, l, r);
    else if (sameValue(r, b) || sameValue(l, r)) value = l;
    else if (sameValue(l, b)) value = r;
    else value = isLater(localTimes.get(key), remoteTimes.get(key)) ? l : r;

    if (value !== undefined) merged[key] = value;
  }
  return { data: merged as RecordData, deleted };
}

/** Whether two versions hold the same record content (empty values count as absent). */
export function sameRecordData(a: RecordData, b: RecordData): boolean {
  const [fieldsA, fieldsB] = [fieldsOf(a), fieldsOf(b)];
  return fieldKeys(a, b).every((key) => sameValue(fieldsA[key], fieldsB[key]));
}

/** Per field, when the chain last changed it (walking from `base`). */
function fieldEditTimes(base: RecordData, chain: readonly MergeVersion[]): Map<string, string> {
  const times = new Map<string, string>();
  let previous = base;
  for (const version of chain) {
    const [before, after] = [fieldsOf(previous), fieldsOf(version.data)];
    for (const key of fieldKeys(previous, version.data)) {
      if (!sameValue(before[key], after[key])) times.set(key, version.editedAt);
    }
    previous = version.data;
  }
  return times;
}

function fieldsOf(record: RecordData): Record<string, unknown> {
  return record as unknown as Record<string, unknown>;
}

/** Every payload key of the records, `type` (and the envelope's `schemaVersion`) aside. */
function fieldKeys(...records: RecordData[]): string[] {
  const keys = new Set(records.flatMap((record) => Object.keys(record)));
  keys.delete("type");
  keys.delete("schemaVersion");
  return [...keys];
}

/** Three-way merge of a string list: additions and removals of either side both apply. */
function mergeSet(base: unknown, local: unknown, remote: unknown): string[] | undefined {
  const [b, l, r] = [asStrings(base), asStrings(local), asStrings(remote)];
  const removed = new Set(b.filter((item) => !l.includes(item) || !r.includes(item)));
  const merged = [...new Set([...l, ...r])].filter((item) => !removed.has(item));
  return merged.length > 0 ? merged : undefined;
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

/** Deep equality of two field values; `undefined`, `""` and `[]` all mean "not set". */
function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (Array.isArray(value) && value.length === 0) return "";
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** Whether `a` is strictly later than `b`; an unknown time is never later. */
function isLater(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined) return false;
  if (b === undefined) return true;
  return Date.parse(a) > Date.parse(b);
}
