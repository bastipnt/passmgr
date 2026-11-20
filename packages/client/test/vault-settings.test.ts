import { describe, expect, it } from "vitest";
import { vaultSettingsActions } from "../src/vaults/vault-settings";

describe("vaultSettingsActions", () => {
  it("lets owners of a shared vault edit, rotate and delete it", () => {
    expect(vaultSettingsActions({ kind: "shared", role: "owner" })).toEqual({
      edit: true,
      rotateKey: true,
      delete: true,
    });
  });

  it("never deletes the personal vault", () => {
    expect(vaultSettingsActions({ kind: "personal", role: "owner" })).toEqual({
      edit: true,
      rotateKey: true,
      delete: false,
    });
  });

  it("lets managers edit and rotate, not delete", () => {
    expect(vaultSettingsActions({ kind: "shared", role: "manage" })).toEqual({
      edit: true,
      rotateKey: true,
      delete: false,
    });
  });

  it.each(["write", "read"] as const)("gives %s members no vault actions", (role) => {
    expect(vaultSettingsActions({ kind: "shared", role })).toEqual({
      edit: false,
      rotateKey: false,
      delete: false,
    });
  });
});
