import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { passwordKeySchema, recoveryKeySchema, userKeySchema } from "../../src/user/key-schema";

function b64(bytes: number): string {
  return Buffer.from(new Uint8Array(bytes)).toString("base64");
}

const VALID_ARGON = { t: 3, m: 128 * 1024, p: 1 };
const VALID_PASSWORD_KEY = {
  passwordKekParams: VALID_ARGON,
  passwordKekSalt: b64(32),
  encryptedVaultKey: b64(48),
  vaultKeyEncryptionNonce: b64(24),
};
const VALID_RECOVERY_KEY = {
  recoveryKekSalt: b64(32),
  encryptedVaultKeyRecovery: b64(48),
  vaultKeyEncryptionNonceRecovery: b64(24),
};
const VALID_USER_KEY = { ...VALID_PASSWORD_KEY, ...VALID_RECOVERY_KEY };

describe("argonParams bounds (via passwordKeySchema)", () => {
  it("accepts the documented default (t=3, m=128MiB, p=1)", () => {
    expect(passwordKeySchema.parse(VALID_PASSWORD_KEY)).toBeTruthy();
  });

  it.each([
    ["t", { t: 4, m: 128 * 1024, p: 1 }],
    ["m=64MiB", { t: 3, m: 64 * 1024, p: 1 }],
    ["m=256MiB", { t: 3, m: 256 * 1024, p: 1 }],
    ["m=192MiB (multiple of 64KiB)", { t: 3, m: 192 * 1024, p: 1 }],
    ["p=4", { t: 3, m: 128 * 1024, p: 4 }],
  ])("accepts %s", (_label, params) => {
    expect(() =>
      passwordKeySchema.parse({ ...VALID_PASSWORD_KEY, passwordKekParams: params }),
    ).not.toThrow();
  });

  it.each([
    ["t below range", { t: 2, m: 128 * 1024, p: 1 }],
    ["t above range", { t: 5, m: 128 * 1024, p: 1 }],
    ["m below floor", { t: 3, m: 64 * 1024 - 1, p: 1 }],
    ["m above ceiling", { t: 3, m: 256 * 1024 + 1, p: 1 }],
    ["m not multiple of 64KiB", { t: 3, m: 128 * 1024 + 1, p: 1 }],
    ["p=0", { t: 3, m: 128 * 1024, p: 0 }],
    ["p=5", { t: 3, m: 128 * 1024, p: 5 }],
  ])("rejects %s", (_label, params) => {
    expect(() =>
      passwordKeySchema.parse({ ...VALID_PASSWORD_KEY, passwordKekParams: params }),
    ).toThrow();
  });

  it("property: any in-range argon params parse", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 4 }),
        // m must be a multiple of 64 * 1024 in [64 MiB, 256 MiB] — i.e. 1×–4× of 64 MiB.
        fc.integer({ min: 1, max: 4 }).map((step) => step * 64 * 1024),
        fc.integer({ min: 1, max: 4 }),
        (t, m, p) => {
          expect(() =>
            passwordKeySchema.parse({
              ...VALID_PASSWORD_KEY,
              passwordKekParams: { t, m, p },
            }),
          ).not.toThrow();
        },
      ),
    );
  });

  it("property: any out-of-range t/p rejects", () => {
    fc.assert(
      fc.property(
        fc.integer().filter((n) => n < 3 || n > 4),
        fc.integer().filter((n) => n < 1 || n > 4),
        (t, p) => {
          expect(() =>
            passwordKeySchema.parse({
              ...VALID_PASSWORD_KEY,
              passwordKekParams: { t, m: 128 * 1024, p },
            }),
          ).toThrow();
        },
      ),
    );
  });
});

describe("passwordKeySchema base64 length boundaries", () => {
  it("accepts exact lengths (44/64/32)", () => {
    expect(() => passwordKeySchema.parse(VALID_PASSWORD_KEY)).not.toThrow();
  });

  it.each([
    ["passwordKekSalt", "passwordKekSalt", 32],
    ["encryptedVaultKey", "encryptedVaultKey", 48],
    ["vaultKeyEncryptionNonce", "vaultKeyEncryptionNonce", 24],
  ])("rejects off-by-one in %s", (_label, field, byteLen) => {
    const exact = b64(byteLen);
    const shorter = exact.slice(0, -1); // strip 1 char
    const longer = exact + "A"; // add 1 char (still a valid base64 char)

    for (const bad of [shorter, longer]) {
      expect(() => passwordKeySchema.parse({ ...VALID_PASSWORD_KEY, [field]: bad })).toThrow();
    }
  });

  it("property: random base64 of wrong length is rejected", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 16 }).filter((n) => n !== 24),
        (bytes) => {
          const wrong = b64(bytes);
          expect(() =>
            passwordKeySchema.parse({ ...VALID_PASSWORD_KEY, vaultKeyEncryptionNonce: wrong }),
          ).toThrow();
        },
      ),
    );
  });
});

describe("recoveryKeySchema base64 length boundaries", () => {
  it("accepts exact lengths (44/64/32)", () => {
    expect(() => recoveryKeySchema.parse(VALID_RECOVERY_KEY)).not.toThrow();
  });

  it.each([
    ["recoveryKekSalt", "recoveryKekSalt", 32],
    ["encryptedVaultKeyRecovery", "encryptedVaultKeyRecovery", 48],
    ["vaultKeyEncryptionNonceRecovery", "vaultKeyEncryptionNonceRecovery", 24],
  ])("rejects off-by-one in %s", (_label, field, byteLen) => {
    const exact = b64(byteLen);
    expect(() =>
      recoveryKeySchema.parse({ ...VALID_RECOVERY_KEY, [field]: exact.slice(0, -1) }),
    ).toThrow();
    expect(() =>
      recoveryKeySchema.parse({ ...VALID_RECOVERY_KEY, [field]: exact + "A" }),
    ).toThrow();
  });
});

describe("userKeySchema (merged password + recovery)", () => {
  it("accepts a fully-populated key bundle", () => {
    expect(() => userKeySchema.parse(VALID_USER_KEY)).not.toThrow();
  });

  it.each(Object.keys(VALID_USER_KEY))("rejects when %s is missing", (key) => {
    const incomplete = { ...VALID_USER_KEY };
    delete (incomplete as Record<string, unknown>)[key];
    expect(() => userKeySchema.parse(incomplete)).toThrow();
  });
});
