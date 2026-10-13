import type { DecryptedRecord, LoginRecord } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { describeVersionChanges } from "../src/records/version-changes";

function makeRecord(
  version: number,
  fields: Partial<DecryptedRecord & LoginRecord> = {},
): DecryptedRecord {
  return {
    recordId: "r1",
    version,
    schemaVersion: 1,
    type: "login",
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
  it("names each tag added and removed", () => {
    const previous = makeRecord(1, { tags: ["work", "home"] });
    const version = makeRecord(2, { tags: ["Work", "bank"] });

    expect(describeVersionChanges(version, previous).map((c) => c.label)).toEqual([
      "Tag added: bank",
      "Tag removed: home",
      "Tag renamed: work → Work",
    ]);
  });

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

  it("uses a custom field's own title", () => {
    const previous = makeRecord(1);
    const version = makeRecord(2, {
      customFields: [{ title: "Recovery codes", type: "secret", value: "a1b2" }],
    });

    expect(describeVersionChanges(version, previous)).toEqual([
      { key: "custom:Recovery codes:0", status: "added", label: "Recovery codes added" },
    ]);
  });

  it("names the fields of other record types by their label", () => {
    const card = { ...makeRecord(1), type: "card" as const, title: "Visa" };
    const previous: DecryptedRecord = { ...card, number: "4111", expiry: "01/27" };
    const version: DecryptedRecord = { ...card, version: 2, number: "4242", pin: "1234" };

    expect(describeVersionChanges(version, previous).map((c) => c.label)).toEqual([
      "Card number changed",
      "PIN added",
      "Expiry date removed",
    ]);
  });

  it("reports starring and unstarring", () => {
    expect(describeVersionChanges(makeRecord(2, { favorite: true }), makeRecord(1))).toEqual([
      { key: "favorite", status: "added", label: "Added to favorites" },
    ]);
    expect(
      describeVersionChanges(makeRecord(3), makeRecord(2, { favorite: true })).map((c) => c.label),
    ).toEqual(["Removed from favorites"]);
  });

  it("lists a star after the field changes made with it", () => {
    const version = makeRecord(2, { favorite: true, password: "new-password" });

    expect(describeVersionChanges(version, makeRecord(1)).map((c) => c.label)).toEqual([
      "Password changed",
      "Added to favorites",
    ]);
  });
});
