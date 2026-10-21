import type { VaultUnlockInfo } from "@repo/schema";
import type { ProfileEntry } from "@repo/store";
import { describe, expect, it, vi } from "vitest";
import { type AccountSignInSteps, signInToAccount } from "../src/account/account-sign-in";

const alice = { mode: "linked", email: "alice@example.com" } as ProfileEntry;
const info = {} as VaultUnlockInfo;

function steps(overrides: Partial<AccountSignInSteps> = {}) {
  return {
    profiles: [alice],
    unlockByEmail: vi.fn<AccountSignInSteps["unlockByEmail"]>().mockResolvedValue(undefined),
    loginUser: vi.fn<AccountSignInSteps["loginUser"]>().mockResolvedValue(info),
    unlock: vi.fn<AccountSignInSteps["unlock"]>().mockResolvedValue(true),
    ...overrides,
  };
}

describe("signInToAccount", () => {
  it("opens a profile on the device without the server login", async () => {
    const s = steps({ unlockByEmail: vi.fn().mockResolvedValue(true) });
    const onOpening = vi.fn();
    await signInToAccount(s, "Alice@Example.com", "pw", undefined, onOpening);

    expect(s.loginUser).not.toHaveBeenCalled();
    expect(onOpening.mock.calls).toEqual([[true]]);
  });

  it("says the device's copy didn't open", async () => {
    const s = steps({ unlockByEmail: vi.fn().mockResolvedValue(false) });
    const onOpening = vi.fn();
    await signInToAccount(s, "alice@example.com", "wrong", undefined, onOpening);

    expect(s.loginUser).not.toHaveBeenCalled();
    expect(onOpening.mock.calls).toEqual([[true], [false]]);
  });

  it("logs in an account new to the device, opening only once the server answered", async () => {
    const s = steps();
    const onOpening = vi.fn();
    await signInToAccount(s, "bob@example.com", "pw", undefined, onOpening);

    expect(s.loginUser).toHaveBeenCalledWith("bob@example.com", "pw", undefined);
    expect(onOpening.mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(s.loginUser).mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(s.unlock).toHaveBeenCalledWith(info);
  });

  it("opens nothing when the server login failed", async () => {
    const s = steps({ loginUser: vi.fn().mockResolvedValue(undefined) });
    const onOpening = vi.fn();
    await signInToAccount(s, "bob@example.com", "pw", undefined, onOpening);

    expect(s.unlock).not.toHaveBeenCalled();
    expect(onOpening).not.toHaveBeenCalled();
  });
});
