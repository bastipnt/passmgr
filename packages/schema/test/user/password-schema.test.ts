import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH, passwordSchema } from "../../src/user/password-schema";

describe("passwordSchema", () => {
  it("accepts a password of the minimum length", () => {
    expect(passwordSchema.safeParse("a".repeat(PASSWORD_MIN_LENGTH)).success).toBe(true);
  });

  it("rejects a shorter password", () => {
    expect(passwordSchema.safeParse("a".repeat(PASSWORD_MIN_LENGTH - 1)).success).toBe(false);
  });

  it("rejects a non-string", () => {
    expect(passwordSchema.safeParse(12345678).success).toBe(false);
  });
});
