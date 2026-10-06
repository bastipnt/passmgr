import { describe, expect, it } from "vitest";
import { unsyncedChangesWarning } from "../src/hooks/use-pending-change-count";

describe("unsyncedChangesWarning", () => {
  it("says nothing while nothing is pending (or not yet counted)", () => {
    expect(unsyncedChangesWarning(undefined)).toBe("");
    expect(unsyncedChangesWarning(0)).toBe("");
  });

  it("counts the changes that would be lost", () => {
    expect(unsyncedChangesWarning(1)).toBe(
      " 1 change on this device hasn't synced yet and will be lost.",
    );
    expect(unsyncedChangesWarning(4)).toContain("4 changes on this device");
  });
});
