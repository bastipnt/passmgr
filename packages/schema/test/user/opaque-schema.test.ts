import { describe, expect, it } from "vitest";
import { finishLoginInputSchema, startLoginInputSchema } from "../../src/user/login-schema";
import { opaqueMessageSchema } from "../../src/user/opaque-schema";
import {
  finishRecoveryInputSchema,
  startRecoveryInputSchema,
} from "../../src/user/recovery-schema";
import { nonCanonicalBase64 as nonCanonical } from "../../testing/non-canonical";

// 98 bytes, the size of a P-256 KE1: the last digit before "=" has unused low bits.
const MESSAGE = Buffer.from(new Uint8Array(98).fill(7)).toString("base64");

describe("opaqueMessageSchema", () => {
  it("accepts canonical base64", () => {
    expect(opaqueMessageSchema.parse(MESSAGE)).toBe(MESSAGE);
  });

  it("rejects a non-canonical encoding of the same bytes", () => {
    const altered = nonCanonical(MESSAGE);
    expect(Buffer.from(altered, "base64")).toEqual(Buffer.from(MESSAGE, "base64"));
    expect(opaqueMessageSchema.safeParse(altered).success).toBe(false);
  });

  it("rejects text that is not base64", () => {
    expect(opaqueMessageSchema.safeParse("not base64!").success).toBe(false);
  });
});

describe("login and recovery inputs", () => {
  const email = "a@b.co";

  it("rejects a non-canonical startLoginRequest and finishLoginRequest", () => {
    const altered = nonCanonical(MESSAGE);
    expect(startLoginInputSchema.safeParse({ email, startLoginRequest: altered }).success).toBe(
      false,
    );
    expect(
      finishLoginInputSchema.safeParse({
        email,
        attemptId: "3f1c2b4e-8a6d-4c1e-9b7a-2d5e6f708192",
        finishLoginRequest: altered,
        authSalt: Buffer.from(new Uint8Array(32)).toString("base64"),
      }).success,
    ).toBe(false);
  });

  it("rejects a non-canonical recovery registrationRequest", () => {
    const parsed = startRecoveryInputSchema.safeParse({
      email,
      recoveryAuthKey: Buffer.from(new Uint8Array(32)).toString("base64"),
      registrationRequest: nonCanonical(MESSAGE),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-canonical recovery registrationRecord", () => {
    const parsed = finishRecoveryInputSchema.shape.registrationRecord.safeParse(
      nonCanonical(MESSAGE),
    );
    expect(parsed.success).toBe(false);
  });
});
