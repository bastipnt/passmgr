import type { DecryptedRecord } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { getPasswordHealth } from "./password-health";

function makeRecord(recordId: string, fields: Partial<DecryptedRecord> = {}): DecryptedRecord {
  return {
    recordId,
    version: 1,
    schemaVersion: 1,
    title: recordId,
    clientUpdatedAt: "2026-09-01T10:00:00.000Z",
    created_at: null,
    firstCreatedAt: null,
    ...fields,
  } as DecryptedRecord;
}

describe("getPasswordHealth", () => {
  it("is null for a login without a password", () => {
    const record = makeRecord("a");
    expect(getPasswordHealth(record, [record])).toBeNull();
  });

  it("finds other logins with the same password, but not the login itself", () => {
    const github = makeRecord("github", { password: "shared-secret-1" });
    const figma = makeRecord("figma", { password: "shared-secret-1" });
    const notion = makeRecord("notion", { password: "something-else" });

    const health = getPasswordHealth(github, [github, figma, notion]);

    expect(health?.reusedIn.map((r) => r.recordId)).toEqual(["figma"]);
    expect(health?.checkedCount).toBe(3);
  });

  it("reports whether a TOTP secret is set", () => {
    const withTotp = makeRecord("a", { password: "pw-123456", totp: "JBSWY3DPEHPK3PXP" });
    const withoutTotp = makeRecord("b", { password: "pw-123456" });

    expect(getPasswordHealth(withTotp, [withTotp])?.hasTotp).toBe(true);
    expect(getPasswordHealth(withoutTotp, [withoutTotp])?.hasTotp).toBe(false);
  });
});
