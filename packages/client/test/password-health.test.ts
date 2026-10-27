import type { DecryptedRecord, LoginRecord } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { getPasswordHealth } from "../src/records/password-health";
import { passwordIssues } from "../src/records/password-issues";

function makeRecord(recordId: string, fields: Partial<LoginRecord> = {}): DecryptedRecord {
  return {
    recordId,
    version: 1,
    schemaVersion: 1,
    type: "login",
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
  });

  it("checks Wi-Fi passwords like logins, but other types' secrets not", () => {
    const github = makeRecord("github", { password: "shared-secret-1" });
    const wifi = { ...makeRecord("wifi"), type: "wifi", password: "shared-secret-1" } as const;
    const card = { ...makeRecord("card"), type: "card", pin: "shared-secret-1" } as const;

    expect(getPasswordHealth(wifi, [github, wifi])).toEqual({ reusedIn: [github] });
    expect(getPasswordHealth(github, [github, wifi, card])).toEqual({ reusedIn: [wifi] });
  });
});

describe("passwordIssues", () => {
  const github = makeRecord("github", { password: "shared-secret-1" });
  const figma = makeRecord("figma", { password: "shared-secret-1" });
  const health = getPasswordHealth(github, [github, figma])!;
  const clean = { reusedIn: [] };

  it("is empty for a strong, unique, unbreached, recent password", () => {
    expect(
      passwordIssues({
        health: clean,
        strength: { level: "strong", label: "Strong" },
        breachCount: 0,
        old: undefined,
        twoFactorSite: undefined,
      }),
    ).toEqual([]);
  });

  it("lists every finding, most urgent first", () => {
    const issues = passwordIssues({
      health,
      strength: { level: "fair", label: "Fair" },
      breachCount: 12,
      old: { record: github, changedAt: "2024-01-01T00:00:00.000Z", ageDays: 600 },
      twoFactorSite: { domain: "github.com" },
    });

    expect(issues.map((issue) => issue.kind)).toEqual([
      "breached",
      "weak",
      "reused",
      "old",
      "missing-two-factor",
    ]);
    expect(issues[2]).toEqual({ kind: "reused", records: [figma] });
  });

  it("waits for a rating before calling a password weak", () => {
    const issues = passwordIssues({
      health: clean,
      strength: null,
      breachCount: null,
      old: undefined,
      twoFactorSite: undefined,
    });
    expect(issues).toEqual([]);
  });
});
