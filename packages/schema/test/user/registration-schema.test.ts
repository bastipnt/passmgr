import { describe, expect, it } from "vitest";
import {
  finishRegistrationInputSchema,
  startRegistrationInputSchema,
  startRegistrationOutputSchema,
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

const VALID_EMAILS = ["alice@example.com", "bob.smith@example.co.uk", "user+tag@sub.example.io"];
const INVALID_EMAILS = ["", "no-at", "@nouser.com", "double@@example.com"];

describe("startRegistrationInputSchema", () => {
  it.each(VALID_EMAILS)("accepts email %s", (email) => {
    expect(() =>
      startRegistrationInputSchema.parse({ email, registrationRequest: "x" }),
    ).not.toThrow();
  });

  it.each(INVALID_EMAILS)("rejects invalid email %j", (email) => {
    expect(() => startRegistrationInputSchema.parse({ email, registrationRequest: "x" })).toThrow();
  });

  it("rejects missing registrationRequest", () => {
    expect(() => startRegistrationInputSchema.parse({ email: "a@b.cd" })).toThrow();
  });

  it("registration/login email validation symmetry: every valid login email is a valid registration email", () => {
    for (const email of VALID_EMAILS) {
      startLoginInputSchema.parse({ email, startLoginRequest: "x" });
      startRegistrationInputSchema.parse({ email, registrationRequest: "x" });
    }
  });
});

describe("startRegistrationOutputSchema", () => {
  it("accepts a non-empty registrationResponse", () => {
    expect(() =>
      startRegistrationOutputSchema.parse({ registrationResponse: "blob" }),
    ).not.toThrow();
  });

  it("rejects non-string registrationResponse", () => {
    expect(() => startRegistrationOutputSchema.parse({ registrationResponse: 42 })).toThrow();
  });
});

describe("finishRegistrationInputSchema", () => {
  it("accepts a fully-populated record", () => {
    expect(() =>
      finishRegistrationInputSchema.parse({
        email: "alice@example.com",
        registrationRecord: "opaque-record-blob",
        userKeys: VALID_USER_KEYS,
      }),
    ).not.toThrow();
  });

  it("rejects when userKeys is missing", () => {
    expect(() =>
      finishRegistrationInputSchema.parse({
        email: "alice@example.com",
        registrationRecord: "opaque-record-blob",
      }),
    ).toThrow();
  });

  it("rejects when userKeys is malformed (Argon t out of range)", () => {
    expect(() =>
      finishRegistrationInputSchema.parse({
        email: "alice@example.com",
        registrationRecord: "opaque-record-blob",
        userKeys: { ...VALID_USER_KEYS, passwordKekParams: { t: 99, m: 128 * 1024, p: 1 } },
      }),
    ).toThrow();
  });

  it("rejects when userKeys is malformed (recovery vault key wrong length)", () => {
    // b64(48) is 64 chars; slicing one off gives a 63-char string (off-by-one).
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
