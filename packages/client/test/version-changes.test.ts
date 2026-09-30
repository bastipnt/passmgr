import type { DecryptedRecord } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { describeVersionChanges } from "../src/records/version-changes";

function makeRecord(version: number, fields: Partial<DecryptedRecord> = {}): DecryptedRecord {
  return {
    recordId: "r1",
    version,
    schemaVersion: 1,
    title: "GitHub",
    username: "jana",
    password: "old-password",
    clientUpdatedAt: new Date(2026, 0, version).toISOString(),
    created_at: null,
    firstCreatedAt: null,
    ...fields,
  } as DecryptedRecord;
}

describe("describeVersionChanges", () => {
  it("has nothing to report for the first version", () => {
    expect(describeVersionChanges(makeRecord(1), undefined)).toEqual([]);
  });

  it("reports nothing when no field changed", () => {
    expect(describeVersionChanges(makeRecord(2), makeRecord(1))).toEqual([]);
  });

  it("names edited, added and removed fields with short labels", () => {
    const previous = makeRecord(1, { note: "old note" });
    const version = makeRecord(2, { password: "new-password", totp: "JBSWY3DPEHPK3PXP" });

    expect(describeVersionChanges(version, previous).map((c) => c.label)).toEqual([
      "Password changed",
      "2FA added",
      "Note removed",
    ]);
  });

  it("uses an extra field's own title", () => {
    const previous = makeRecord(1);
    const version = makeRecord(2, {
      extraFields: [{ title: "Recovery codes", type: "secret", value: "a1b2" }],
    });

    expect(describeVersionChanges(version, previous)).toEqual([
      { key: "extra:Recovery codes:0", status: "added", label: "Recovery codes added" },
    ]);
  });
});
