import { describe, expect, it } from "vitest";
import {
  finishRegistrationInputSchema,
  startRegistrationInputSchema,
} from "../../src/user/registration-schema";
import { startLoginInputSchema } from "../../src/user/login-schema";

function b64(bytes: number): string {
  return Buffer.from(new Uint8Array(bytes)).toString("base64");
}

const VALID_USER_KEYS = {
  recoveryKekSalt: b64(32),
  encryptedVaultKeyRecovery: b64(48),
  vaultKeyEncryptionNonceRecovery: b64(24),
  passwordKekParams: { t: 3, m: 128 * 1024, p: 1 },
  passwordKekSalt: b64(32),
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

describe("finishRegistrationInputSchema composes key-schema", () => {
  it("rejects when userKeys has out-of-range Argon t", () => {
    expect(() =>
      finishRegistrationInputSchema.parse({
        email: "alice@example.com",
        registrationRecord: "opaque-record-blob",
        userKeys: { ...VALID_USER_KEYS, passwordKekParams: { t: 99, m: 128 * 1024, p: 1 } },
      }),
    ).toThrow();
  });

  it("rejects when userKeys recovery vault key is wrong length", () => {
    expect(() =>
      finishRegistrationInputSchema.parse({
        email: "alice@example.com",
        registrationRecord: "opaque-record-blob",
        userKeys: {
          ...VALID_USER_KEYS,
          encryptedVaultKeyRecovery: b64(48).slice(0, -1),
        },
      }),
    ).toThrow();
  });
});
