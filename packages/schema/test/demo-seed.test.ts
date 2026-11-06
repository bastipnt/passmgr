import { describe, expect, it } from "vitest";
import { recordDataSchema } from "../src/record-types";
import { demoSeed, SEED_VAULTS, seedVaultIndex } from "../src/seed/demo-seed";
import { edgeCaseLoginRecords } from "../src/seed/login-record-seed";

describe("demoSeed", () => {
  const seed = demoSeed();

  it("every version parses against the record schemas", () => {
    for (const { versions } of seed)
      for (const { data } of versions) expect(recordDataSchema.safeParse(data).success).toBe(true);
  });

  it("versions run oldest first, and a trashed record is deleted after its last one", () => {
    for (const { versions, deletedDaysAgo } of seed) {
      const days = versions.map((v) => v.daysAgo);
      expect(days).toEqual([...days].sort((a, b) => b - a));
      if (deletedDaysAgo !== undefined) expect(deletedDaysAgo).toBeLessThan(days.at(-1)!);
    }
  });

  it("spreads records over every seed vault, with favorites, history and trash", () => {
    expect(new Set(seed.map((r) => r.vault))).toEqual(new Set(SEED_VAULTS.keys()));
    expect(seed.some((r) => r.versions.some((v) => v.data.favorite))).toBe(true);
    expect(seed.filter((r) => r.versions.length > 1).length).toBeGreaterThanOrEqual(2);
    expect(seed.some((r) => r.deletedDaysAgo !== undefined)).toBe(true);
  });

  it("leaves the QA edge cases out", () => {
    const titles = new Set(seed.map((r) => r.versions.at(-1)!.data.title));
    for (const { title } of edgeCaseLoginRecords) expect(titles.has(title)).toBe(false);
  });

  it("the personal vault takes what no other vault holds", () => {
    expect(seedVaultIndex({ type: "note", title: "x", note: "" })).toBe(SEED_VAULTS.length - 1);
    expect(SEED_VAULTS.at(-1)!.kind).toBe("personal");
  });
});
