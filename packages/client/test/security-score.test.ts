import type { DecryptedRecord } from "@repo/schema";
import { describe, expect, it } from "vitest";
import {
  SCORE_PENALTY,
  type SecurityScore,
  type SecurityScoreInput,
  securityScore,
  securityScoreLevel,
  securityScoreSummary,
} from "../src/records/security-score";

function record(recordId: string): DecryptedRecord {
  return {
    recordId,
    vaultId: "personal",
    version: 1,
    schemaVersion: 1,
    type: "login",
    title: recordId,
    password: "secret",
    clientUpdatedAt: "2026-09-01T10:00:00.000Z",
    created_at: null,
    firstCreatedAt: null,
  } as DecryptedRecord;
}

const [a, b, c, d] = ["a", "b", "c", "d"].map(record) as [
  DecryptedRecord,
  DecryptedRecord,
  DecryptedRecord,
  DecryptedRecord,
];

const breach = (
  fields: Partial<SecurityScoreInput["breach"]> = {},
): SecurityScoreInput["breach"] => ({
  enabled: true,
  breached: [],
  checking: false,
  failed: false,
  offline: false,
  ...fields,
});

const clean: SecurityScoreInput = {
  monitored: [a, b, c, d],
  weak: [],
  weakFailed: false,
  reused: [],
  old: [],
  insecure: [],
  missingTwoFactor: [],
  twoFactorFailed: false,
  breach: breach(),
};

describe("securityScore", () => {
  it("waits for every check that counts", () => {
    expect(securityScore({ ...clean, monitored: null })).toBeUndefined();
    expect(securityScore({ ...clean, weak: null })).toBeUndefined();
    expect(securityScore({ ...clean, missingTwoFactor: null })).toBeUndefined();
    expect(securityScore({ ...clean, breach: breach({ enabled: null }) })).toBeUndefined();
    expect(securityScore({ ...clean, breach: breach({ breached: null }) })).toBeUndefined();
    expect(securityScore({ ...clean, breach: breach({ checking: true }) })).toBeUndefined();
  });

  it("is 100 without findings and has nothing to score without passwords", () => {
    expect(securityScore(clean)).toEqual({
      score: 100,
      level: "good",
      checked: 4,
      atRisk: 0,
      skipped: [],
    });
    expect(securityScore({ ...clean, monitored: [] })).toMatchObject({ score: null, checked: 0 });
  });

  it("averages each record's health, capping its penalties at the whole record", () => {
    const result = securityScore({
      ...clean,
      weak: [{ record: a, strength: { level: "weak", label: "Weak" } }],
      reused: [{ id: "a", records: [a, b] }],
      breach: breach({ breached: [{ record: c, count: 3 }] }),
    });

    const health = 0 + (1 - SCORE_PENALTY.reused) + 0 + 1;
    expect(result).toMatchObject({ score: Math.round((health / 4) * 100), atRisk: 3 });
  });

  it("leaves out checks that are off or failed, and logins without a password", () => {
    const result = securityScore({
      ...clean,
      monitored: [a],
      weak: null,
      weakFailed: true,
      missingTwoFactor: null,
      twoFactorFailed: true,
      breach: breach({ enabled: false, breached: null }),
      insecure: [{ record: record("e"), hosts: ["example.com"] }],
    });

    expect(result).toMatchObject({
      checked: 1,
      atRisk: 0,
      skipped: ["weak", "breached", "missingTwoFactor"],
    });
  });

  it("skips the breach check offline or after a failed run, counting what it found", () => {
    expect(
      securityScore({ ...clean, breach: breach({ breached: null, offline: true }) }),
    ).toMatchObject({ score: 100, skipped: ["breached"] });
    expect(
      securityScore({
        ...clean,
        breach: breach({ breached: [{ record: a, count: 1 }], failed: true }),
      }),
    ).toMatchObject({ score: 75, skipped: ["breached"] });
  });

  it("is never good while a password is breached", () => {
    const monitored = Array.from({ length: 20 }, (_, i) => record(`r${i}`));
    const result = securityScore({
      ...clean,
      monitored,
      breach: breach({ breached: [{ record: monitored[0]!, count: 1 }] }),
    });

    expect(result).toMatchObject({ score: 95, level: "fair" });
  });
});

describe("securityScoreLevel", () => {
  it("bands the score", () => {
    expect([100, 80, 79, 50, 49, 0].map(securityScoreLevel)).toEqual([
      "good",
      "good",
      "fair",
      "fair",
      "poor",
      "poor",
    ]);
  });
});

describe("securityScoreSummary", () => {
  it("counts the passwords needing attention", () => {
    const score: Omit<SecurityScore, "checked" | "atRisk"> = {
      score: 90,
      level: "good",
      skipped: [],
    };
    expect(securityScoreSummary({ ...score, checked: 1, atRisk: 0 })).toBe(
      "No issues found in 1 password.",
    );
    expect(securityScoreSummary({ ...score, checked: 24, atRisk: 2 })).toBe(
      "2 of 24 passwords need attention.",
    );
  });
});
