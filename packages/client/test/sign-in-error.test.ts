import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "../src/hooks/use-login";

describe("signInErrorMessage", () => {
  it("is empty without an error", () => {
    expect(signInErrorMessage(undefined, undefined, false)).toBeUndefined();
  });

  it("tells an unreachable server apart from wrong credentials", () => {
    expect(signInErrorMessage("unreachable", undefined, false)?.title).toMatch(/can't reach/i);
    expect(signInErrorMessage("credentials", undefined, false)?.detail).toMatch(
      /email and password/i,
    );
  });

  it("asks only for the password of a local vault", () => {
    const { detail } = signInErrorMessage(undefined, "failed", true)!;
    expect(detail).toMatch(/password/i);
    expect(detail).not.toMatch(/email/i);
  });

  it("explains that an account new to the device needs a connection", () => {
    expect(signInErrorMessage(undefined, "wrong_account", false)?.title).toMatch(/offline/i);
  });

  it("shows the throttle as a warning", () => {
    expect(signInErrorMessage("throttled", undefined, false)?.warning).toBe(true);
  });
});
