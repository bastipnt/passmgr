import { afterAll, describe, expect, it } from "vitest";
import {
  getArgonBounds,
  passwordKeySchema,
  setArgonBounds,
  userKeySchema,
} from "../../src/user/key-schema";

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

describe("argonParams bounds (superRefine)", () => {
  it("accepts the documented default (t=3, m=128MiB, p=1)", () => {
    expect(passwordKeySchema.parse(VALID_PASSWORD_KEY)).toBeTruthy();
  });

  it.each([
    ["t=4", { t: 4, m: 128 * 1024, p: 1 }],
    ["m=64MiB (floor)", { t: 3, m: 64 * 1024, p: 1 }],
    ["m=256MiB (ceiling)", { t: 3, m: 256 * 1024, p: 1 }],
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

describe("argon bounds setter", () => {
  const PROD = {
    tMin: 3,
    tMax: 4,
    mMin: 64 * 1024,
    mMax: 256 * 1024,
    mMultipleOf: 64 * 1024,
    pMin: 1,
    pMax: 4,
  };
  afterAll(() => setArgonBounds(PROD));

  it("getArgonBounds returns the prod defaults", () => {
    setArgonBounds(PROD);
    expect(getArgonBounds()).toEqual(PROD);
  });

  it("relaxing bounds lets previously-invalid params parse", () => {
    setArgonBounds({ tMin: 1, mMin: 8, mMultipleOf: 1 });
    const fast = { t: 1, m: 8, p: 1 };
    expect(() =>
      passwordKeySchema.parse({ ...VALID_PASSWORD_KEY, passwordKekParams: fast }),
    ).not.toThrow();
  });
});
