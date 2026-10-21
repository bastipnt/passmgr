import { describe, expect, it } from "vitest";
import {
  removeVaultsDescription,
  unsyncedChangesWarning,
} from "../src/hooks/use-pending-change-count";

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

describe("removeVaultsDescription", () => {
  it("names the vaults that are only on this device and the unsynced changes", () => {
    const text = removeVaultsDescription(
      [{ mode: "linked" }, { mode: "local" }, { mode: "local" }],
      3,
    );
    expect(text).toContain("all 3 vaults");
    expect(text).toContain("2 vaults have no account");
    expect(text).toContain("3 changes on this device");
  });

  it("speaks of one vault", () => {
    expect(removeVaultsDescription([{ mode: "local" }], undefined)).toBe(
      "This deletes the vault from this device. Accounts and their data on the server are not affected. One vault has no account: this is its only copy, everything in it is lost for good.",
    );
  });
});
