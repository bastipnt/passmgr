import { describe, expect, it } from "vitest";
import type { MemberInfo } from "../src/vaults/sharing";
import {
  memberActions,
  vaultMembersRules,
  vaultSettingsActions,
} from "../src/vaults/vault-settings";

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

type Member = Pick<MemberInfo, "role" | "status" | "isSelf" | "keyVerified">;
const self = (role: Member["role"]): Member => ({
  role,
  status: "active",
  isSelf: true,
  keyVerified: true,
});
const other = (role: Member["role"], extra: Partial<Member> = {}): Member => ({
  role,
  status: "active",
  isSelf: false,
  keyVerified: true,
  ...extra,
});

describe("vaultMembersRules", () => {
  it("lets an owner with another owner manage and leave", () => {
    expect(
      vaultMembersRules({ role: "owner" }, [self("owner"), other("owner"), other("read")]),
    ).toEqual({ manage: true, lastOwner: false, verifyPrompt: false });
  });

  it("keeps the last active owner from leaving", () => {
    const members = [self("owner"), other("owner", { status: "pending" }), other("manage")];
    expect(vaultMembersRules({ role: "owner" }, members).lastOwner).toBe(true);
  });

  it("doesn't guess the last owner while the list didn't load", () => {
    expect(vaultMembersRules({ role: "owner" }, undefined)).toEqual({
      manage: true,
      lastOwner: false,
      verifyPrompt: false,
    });
  });

  it("lets a manager manage and leave, and prompts to verify someone unverified", () => {
    const members = [self("manage"), other("owner", { keyVerified: false })];
    expect(vaultMembersRules({ role: "manage" }, members)).toEqual({
      manage: true,
      lastOwner: false,
      verifyPrompt: true,
    });
  });

  it.each(["write", "read"] as const)(
    "lets %s members leave, not manage or get the prompt",
    (role) => {
      const members = [self(role), other("owner", { keyVerified: false })];
      expect(vaultMembersRules({ role }, members)).toEqual({
        manage: false,
        lastOwner: false,
        verifyPrompt: false,
      });
    },
  );

  it("doesn't prompt for the user's own key", () => {
    const members = [{ ...self("owner"), keyVerified: false }, other("owner")];
    expect(vaultMembersRules({ role: "owner" }, members).verifyPrompt).toBe(false);
  });
});

describe("memberActions", () => {
  it("lets an owner manage another member and hand the vault to them", () => {
    expect(memberActions("owner", other("write"))).toEqual({
      manage: true,
      transfer: true,
      verify: false,
    });
  });

  it("doesn't hand the vault to an invitee or another owner", () => {
    expect(memberActions("owner", other("write", { status: "pending" })).transfer).toBe(false);
    expect(memberActions("owner", other("owner")).transfer).toBe(false);
  });

  it("lets a manager manage those below owner, never hand the vault over", () => {
    expect(memberActions("manage", other("write"))).toEqual({
      manage: true,
      transfer: false,
      verify: false,
    });
    expect(memberActions("manage", other("owner")).manage).toBe(false);
  });

  it.each(["write", "read"] as const)("lets %s members only verify others", (role) => {
    expect(memberActions(role, other("read", { keyVerified: false }))).toEqual({
      manage: false,
      transfer: false,
      verify: true,
    });
  });

  it("offers nothing on the user's own row", () => {
    expect(memberActions("owner", { ...self("owner"), keyVerified: false })).toEqual({
      manage: false,
      transfer: false,
      verify: false,
    });
  });
});
