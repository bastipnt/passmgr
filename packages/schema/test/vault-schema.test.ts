import { describe, expect, it } from "vitest";
import { rotateVaultKeyInputSchema } from "../src/vault-schema";

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
  ])("rejects %s", (_label, override) => {
    expect(() => rotateVaultKeyInputSchema.parse({ ...VALID, ...override })).toThrow();
  });
});
