import { describe, expect, it } from "vitest";
import { removeProfile } from "../src/account/remove-profile";

function fakes() {
  const calls: string[] = [];
  return {
    calls,
    lock: () => calls.push("lock"),
    store: {
      removeProfile: async (profileId: string) => {
        calls.push(`remove ${profileId}`);
      },
      removeAllProfiles: async () => {
        calls.push("remove all");
      },
    },
  };
}

describe("removeProfile", () => {
  it("locks before it removes the profile", async () => {
    const { calls, lock, store } = fakes();
    await removeProfile({ lock, store }, { profileId: "p1" });
    expect(calls).toEqual(["lock", "remove p1"]);
  });

  it("locks before it removes every profile", async () => {
    const { calls, lock, store } = fakes();
    await removeProfile({ lock, store }, "all");
    expect(calls).toEqual(["lock", "remove all"]);
  });

  it("has locked even when the removal fails", async () => {
    const { calls, lock, store } = fakes();
    store.removeProfile = async () => {
      throw new Error("disk");
    };
    await expect(removeProfile({ lock, store }, { profileId: "p1" })).rejects.toThrow("disk");
    expect(calls).toEqual(["lock"]);
  });
});
