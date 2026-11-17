import type { DecryptedRecord } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { type SortOption, sortRecords } from "../src/providers/SortedRecordsProvider";

const TITLES = ["alpha", "Alpha", "Ärger", "beta", "Zulu", "zebra", "123", "", "émile", "Émile"];
const DAY = 86_400_000;

function makeRecords(count: number): DecryptedRecord[] {
  let seed = 7;
  const next = (n: number) => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed % n;
  };
  const at = () => new Date(Date.UTC(2026, 0, 1) + next(30) * DAY).toISOString();
  return Array.from({ length: count }, (_, i) => {
    const created = next(4) === 0 ? null : at();
    return {
      type: "login",
      schemaVersion: 1,
      recordId: `r${i}`,
      vaultId: "v1",
      version: 1,
      title: TITLES[next(TITLES.length)]!,
      clientUpdatedAt: at(),
      created_at: next(2) === 0 ? created : null,
      firstCreatedAt: created,
    } as DecryptedRecord;
  });
}

// The comparator before sort keys were precomputed: the order must not change.
function referenceSort(records: DecryptedRecord[], sort: SortOption): DecryptedRecord[] {
  const createdAt = (r: DecryptedRecord) => r.firstCreatedAt ?? r.created_at;
  const ts = (a: string | null, b: string | null) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return new Date(a).getTime() - new Date(b).getTime();
  };
  const title = (a: DecryptedRecord, b: DecryptedRecord) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  return [...records].sort((a, b) => {
    const primary = {
      "most-recent": () =>
        new Date(b.clientUpdatedAt).getTime() - new Date(a.clientUpdatedAt).getTime(),
      alphabetical: () => title(a, b),
      newest: () => ts(createdAt(b), createdAt(a)),
      oldest: () => ts(createdAt(a), createdAt(b)),
    }[sort]();
    return (
      primary ||
      ts(createdAt(a), createdAt(b)) ||
      new Date(a.clientUpdatedAt).getTime() - new Date(b.clientUpdatedAt).getTime() ||
      title(a, b)
    );
  });
}

describe("sortRecords", () => {
  const records = makeRecords(500);
  it.each<SortOption>(["most-recent", "alphabetical", "newest", "oldest"])(
    "orders %s as the per-comparison comparator did",
    (sort) => {
      const ids = (list: DecryptedRecord[]) => list.map((r) => r.recordId);
      expect(ids(sortRecords(records, sort))).toEqual(ids(referenceSort(records, sort)));
    },
  );

  it("leaves its input as it was", () => {
    const before = records.map((r) => r.recordId);
    sortRecords(records, "alphabetical");
    expect(records.map((r) => r.recordId)).toEqual(before);
  });
});
