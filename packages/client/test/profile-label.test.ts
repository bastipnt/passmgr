import { describe, expect, it } from "vitest";
import { profileDetail, profileHue } from "../src/util/profile-label";
import { VAULT_COLORS } from "../src/vaults/vault-info";

describe("profileHue", () => {
  it("is one of the vault colours and stable per profile", () => {
    const hue = profileHue({ profileId: "p-alice" });
    expect(Object.values(VAULT_COLORS)).toContain(hue);
    expect(profileHue({ profileId: "p-alice" })).toBe(hue);
  });
});

describe("profileDetail", () => {
  const now = Date.parse("2026-10-21T12:00:00.000Z");

  it("says what kind of vault it is and when it was last opened", () => {
    expect(profileDetail({ mode: "linked", lastUsedAt: "2026-10-20T12:00:00.000Z" }, now)).toBe(
      "Account · Last opened yesterday",
    );
    expect(profileDetail({ mode: "local", lastUsedAt: "2026-10-21T11:59:30.000Z" }, now)).toBe(
      "On this device only · Last opened just now",
    );
  });
});
