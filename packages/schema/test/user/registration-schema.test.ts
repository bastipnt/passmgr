import { describe, expect, it } from "vitest";
import { startLoginInputSchema } from "../../src/user/login-schema";
import {
  finishRegistrationInputSchema,
  startRegistrationInputSchema,
} from "../../src/user/registration-schema";

function b64(bytes: number): string {
  return Buffer.from(new Uint8Array(bytes)).toString("base64");
}

const VALID_USER_KEYS = {
  recoveryKekSalt: b64(32),
  encryptedAccountKeyRecovery: b64(48),
  accountKeyEncryptionNonceRecovery: b64(24),
  recoveryVerifier: b64(32),
  passwordKekParams: { t: 3, m: 128 * 1024, p: 1 },
  passwordKekSalt: b64(32),
  encryptedAccountKey: b64(48),
  accountKeyEncryptionNonce: b64(24),
};

const VALID_PERSONAL_VAULT = {
  vaultId: "0199a3c4-5b6d-7e8f-9a0b-1c2d3e4f5a6b",
  keyVersion: 1,
  encryptedVaultKey: b64(48),
  vaultKeyEncryptionNonce: b64(24),
};

describe("registration/login email symmetry", () => {
  it.each(["alice@example.com", "bob.smith@example.co.uk", "user+tag@sub.example.io"])(
    "%s parses on both schemas",
    (email) => {
      expect(() => startLoginInputSchema.parse({ email, startLoginRequest: "x" })).not.toThrow();
      expect(() =>
        startRegistrationInputSchema.parse({ email, registrationRequest: "x" }),
      ).not.toThrow();
    },
  );
});

describe("email normalization", () => {
  it("trims and lowercases on login and registration", () => {
    const email = "  Alice@Example.COM ";
    expect(startLoginInputSchema.parse({ email, startLoginRequest: "x" }).email).toBe(
      "alice@example.com",
    );
    expect(
      finishRegistrationInputSchema.parse({
        email,
        registrationRecord: "r",
        userKeys: VALID_USER_KEYS,
        personalVault: VALID_PERSONAL_VAULT,
      }).email,
    ).toBe("alice@example.com");
  });

  it("rejects a non-email on finishRegistration", () => {
    expect(() =>
      finishRegistrationInputSchema.parse({
        email: "not-an-email",
        registrationRecord: "r",
        userKeys: VALID_USER_KEYS,
        personalVault: VALID_PERSONAL_VAULT,
      }),
    ).toThrow();
  });
});

describe("finishRegistrationInputSchema composes key-schema", () => {
  const valid = {
    email: "alice@example.com",
    registrationRecord: "opaque-record-blob",
    userKeys: VALID_USER_KEYS,
    personalVault: VALID_PERSONAL_VAULT,
  };

  it("accepts a complete registration", () => {
    expect(() => finishRegistrationInputSchema.parse(valid)).not.toThrow();
  });

  it("rejects when userKeys has out-of-range Argon t", () => {
    expect(() =>
      finishRegistrationInputSchema.parse({
        ...valid,
        userKeys: { ...VALID_USER_KEYS, passwordKekParams: { t: 99, m: 128 * 1024, p: 1 } },
      }),
    ).toThrow();
  });

  it("rejects when userKeys recovery account key is wrong length", () => {
    expect(() =>
      finishRegistrationInputSchema.parse({
        ...valid,
        userKeys: { ...VALID_USER_KEYS, encryptedAccountKeyRecovery: b64(48).slice(0, -1) },
      }),
    ).toThrow();
  });

  it("rejects a missing personal vault", () => {
    const { personalVault: _, ...withoutVault } = valid;
    expect(() => finishRegistrationInputSchema.parse(withoutVault)).toThrow();
  });

  it.each([
    ["a non-UUID vaultId", { vaultId: "personal" }],
    ["keyVersion 0", { keyVersion: 0 }],
    ["keyVersion 2 (a new vault starts at 1)", { keyVersion: 2 }],
    ["a truncated wrapped vault key", { encryptedVaultKey: b64(48).slice(0, -1) }],
    ["a wrong-length nonce", { vaultKeyEncryptionNonce: b64(12) }],
  ])("rejects a personal vault with %s", (_label, override) => {
    expect(() =>
      finishRegistrationInputSchema.parse({
        ...valid,
        personalVault: { ...VALID_PERSONAL_VAULT, ...override },
      }),
    ).toThrow();
  });
});
