import { describe, expect, it } from "vitest";
import { finishLoginInputSchema } from "../../src/user/login-schema";
import { nonCanonicalBase64 } from "../../testing/non-canonical";

const authSalt = finishLoginInputSchema.shape.authSalt;
const canonical = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");

describe("finishLoginInputSchema.authSalt", () => {
  it("takes the canonical spelling of 32 bytes", () => {
    expect(authSalt.parse(canonical)).toBe(canonical);
  });

  it("refuses the same bytes with an unused low bit set", () => {
    expect(authSalt.safeParse(nonCanonicalBase64(canonical)).success).toBe(false);
  });

  it("refuses the same bytes without padding", () => {
    expect(authSalt.safeParse(canonical.replace(/=+$/, "")).success).toBe(false);
  });

  it("keeps the 44-character bound", () => {
    expect(authSalt.safeParse(Buffer.from(new Uint8Array(30)).toString("base64")).success).toBe(
      false,
    );
  });
});
