import { describe, expect, it } from "vitest";
import { canAssignRole, inviteMemberInputSchema, roleAtLeast } from "../src/sharing-schema";
import { rotateVaultKeyInputSchema, type VaultRole } from "../src/vault-schema";

const VAULT_ROLES: VaultRole[] = ["owner", "manage", "write", "read"];

function b64(bytes: number): string {
  return Buffer.from(new Uint8Array(bytes)).toString("base64");
}

const VALID = {
  vaultId: "0199a3c4-5b6d-7e8f-9a0b-1c2d3e4f5a6b",
  keyVersion: 2,
  encryptedVaultKey: b64(48),
  vaultKeyEncryptionNonce: b64(24),
  encryptedMeta: b64(40),
  metaEncryptionNonce: b64(24),
  previousKey: { keyVersion: 1, encryptedVaultKey: b64(48), vaultKeyEncryptionNonce: b64(24) },
  senderKeyVersion: 1,
  memberKeys: [
    {
      userId: "0199a3c4-5b6d-7e8f-9a0b-1c2d3e4f5a6c",
      recipientKeyVersion: 1,
      sealedVaultKey: b64(104),
    },
  ],
};

describe("rotateVaultKeyInputSchema", () => {
  it("takes the next key version with the current key wrapped under it", () => {
    expect(rotateVaultKeyInputSchema.parse(VALID)).toEqual(VALID);
  });

  it.each([
    [
      "keyVersion 1 (nothing to rotate from)",
      { keyVersion: 1, previousKey: { ...VALID.previousKey, keyVersion: 0 } },
    ],
    ["a previous key that isn't the version below", { keyVersion: 3 }],
    [
      "a key version past the maximum",
      { keyVersion: 257, previousKey: { ...VALID.previousKey, keyVersion: 256 } },
    ],
    ["no previous key", { previousKey: undefined }],
    ["two seals for one member", { memberKeys: [VALID.memberKeys[0], VALID.memberKeys[0]] }],
    [
      "a seal that isn't a sealed 32-byte key",
      { memberKeys: [{ ...VALID.memberKeys[0], sealedVaultKey: b64(100) }] },
    ],
    ["no sender keypair version", { senderKeyVersion: undefined }],
  ])("rejects %s", (_label, override) => {
    expect(() => rotateVaultKeyInputSchema.parse({ ...VALID, ...override })).toThrow();
  });
});

describe("roles (canAssignRole / roleAtLeast)", () => {
  it("owners assign anything, managers anything below owner, others nothing", () => {
    expect(VAULT_ROLES.filter((role) => canAssignRole("owner", role))).toEqual(VAULT_ROLES);
    expect(VAULT_ROLES.filter((role) => canAssignRole("manage", role))).toEqual([
      "manage",
      "write",
      "read",
    ]);
    expect(VAULT_ROLES.filter((role) => canAssignRole("write", role))).toEqual([]);
    expect(VAULT_ROLES.filter((role) => canAssignRole("read", role))).toEqual([]);
  });

  it("orders owner > manage > write > read", () => {
    expect(roleAtLeast("owner", "manage")).toBe(true);
    expect(roleAtLeast("write", "write")).toBe(true);
    expect(roleAtLeast("read", "write")).toBe(false);
  });
});

describe("inviteMemberInputSchema", () => {
  const invite = {
    vaultId: VALID.vaultId,
    email: "Bob@Example.com",
    role: "write",
    keyVersion: 1,
    recipientKeyVersion: 1,
    senderKeyVersion: 1,
    sealedVaultKey: b64(104),
  };

  it("takes an invite and normalises the email", () => {
    expect(inviteMemberInputSchema.parse(invite)).toMatchObject({ email: "bob@example.com" });
  });

  it("rejects an unknown role", () => {
    expect(() => inviteMemberInputSchema.parse({ ...invite, role: "admin" })).toThrow();
  });
});
