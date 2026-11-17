import { EMAIL_UNVERIFIED } from "@repo/schema";
import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import { sharingErrorMessage } from "../src/vaults/vault-labels";

function refusal(code: string, httpStatus: number, message = "raw server text") {
  return new TRPCClientError(message, {
    result: { error: { message, code: -1, data: { code, httpStatus } } } as never,
  });
}

describe("sharingErrorMessage", () => {
  it("says to wait when the lookup is rate limited", () => {
    expect(
      sharingErrorMessage(refusal("TOO_MANY_REQUESTS", 429), "fallback", { NOT_FOUND: "none" }),
    ).toBe("Too many attempts for now. Try again in a while.");
  });

  it("says to verify the email, not that the role forbids it", () => {
    expect(sharingErrorMessage(refusal("FORBIDDEN", 403, EMAIL_UNVERIFIED), "fallback")).toMatch(
      /Verify your email address first/,
    );
    expect(sharingErrorMessage(refusal("FORBIDDEN", 403), "fallback")).toBe(
      "Your role in this vault doesn't allow this.",
    );
  });
});
