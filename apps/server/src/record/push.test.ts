import type { PushChange } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { decideChange } from "./push";

describe("decideChange", () => {
  it("throws for a vault missing from the access check instead of denying quietly", () => {
    const change = { vaultId: "v1", recordId: "r1", clientChangeId: "c1" } as PushChange;

    expect(() =>
      decideChange(change, null, 0, { access: new Map(), keyVersions: new Map() }, new Map()),
    ).toThrow("missing from the access check");
  });
});
