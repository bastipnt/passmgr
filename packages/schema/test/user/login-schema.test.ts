import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  finishLoginInputSchema,
  finishLoginOutputSchema,
  startLoginInputSchema,
  startLoginOutputSchema,
} from "../../src/user/login-schema";

function b64(bytes: number): string {
  return Buffer.from(new Uint8Array(bytes)).toString("base64");
}

const VALID_EMAILS = [
  "alice@example.com",
  "bob.smith@example.co.uk",
  "user+tag@sub.example.io",
  "abc123@x.y.zz",
  "first.last@a-b.c-d.io",
  "x@y.zz",
];

const INVALID_EMAILS = [
  "",
  "not-an-email",
  "missing@tld",
  "@nouser.com",
  "spaces in@email.com",
  "double@@example.com",
  "trailing@example.com.",
  "no-at-symbol.com",
];

describe("startLoginInputSchema", () => {
  it.each(VALID_EMAILS)("accepts valid email %s", (email) => {
    expect(() => startLoginInputSchema.parse({ email, startLoginRequest: "x" })).not.toThrow();
  });

  it.each(INVALID_EMAILS)("rejects invalid email %j", (email) => {
    expect(() => startLoginInputSchema.parse({ email, startLoginRequest: "x" })).toThrow();
  });

  it("rejects missing startLoginRequest", () => {
    expect(() => startLoginInputSchema.parse({ email: "a@b.cd" })).toThrow();
  });
});

describe("startLoginOutputSchema", () => {
  it("accepts a non-empty loginResponse", () => {
    expect(() => startLoginOutputSchema.parse({ loginResponse: "blob" })).not.toThrow();
  });

  it("rejects non-string loginResponse", () => {
    expect(() => startLoginOutputSchema.parse({ loginResponse: 42 })).toThrow();
  });
});

describe("finishLoginInputSchema", () => {
  it("accepts valid input (44-char base64 authSalt)", () => {
    expect(() =>
      finishLoginInputSchema.parse({
        email: "alice@example.com",
        finishLoginRequest: "blob",
        authSalt: b64(32),
      }),
    ).not.toThrow();
  });

  it.each([
    ["authSalt one char short", b64(32).slice(0, -1)],
    ["authSalt one char long", b64(32) + "A"],
    ["authSalt empty", ""],
  ])("rejects %s", (_label, authSalt) => {
    expect(() =>
      finishLoginInputSchema.parse({
        email: "alice@example.com",
        finishLoginRequest: "blob",
        authSalt,
      }),
    ).toThrow();
  });

  it("property: any base64 string whose character length is not 44 is rejected", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 64 })
          // bytes 31, 32, 33 all encode to a 44-char base64 string.
          .filter((n) => n !== 31 && n !== 32 && n !== 33),
        (bytes) => {
          expect(() =>
            finishLoginInputSchema.parse({
              email: "alice@example.com",
              finishLoginRequest: "blob",
              authSalt: b64(bytes),
            }),
          ).toThrow();
        },
      ),
    );
  });
});

describe("finishLoginOutputSchema", () => {
  it("accepts valid output", () => {
    expect(() =>
      finishLoginOutputSchema.parse({
        sessionId: "uuid-here",
        userPasswordKeys: {
          passwordKekParams: { t: 3, m: 128 * 1024, p: 1 },
          passwordKekSalt: b64(32),
          encryptedVaultKey: b64(48),
          vaultKeyEncryptionNonce: b64(24),
        },
      }),
    ).not.toThrow();
  });

  it("rejects when userPasswordKeys is missing", () => {
    expect(() => finishLoginOutputSchema.parse({ sessionId: "x" })).toThrow();
  });
});
