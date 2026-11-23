import { describe, expect, it } from "vitest";
import { changeVaultOnServer } from "../src/vaults/change-vault-on-server";

function fakeSync(calls: string[]) {
  return {
    syncFresh: async () => {
      calls.push("syncFresh");
      return true;
    },
  };
}

describe("changeVaultOnServer", () => {
  it("starts the fresh sync round once the change went through", async () => {
    const calls: string[] = [];
    const result = await changeVaultOnServer(fakeSync(calls), async () => {
      calls.push("change");
      return "v1";
    });
    expect(result).toBe("v1");
    expect(calls).toEqual(["change", "syncFresh"]);
  });

  it("syncs nothing when the server refused the change", async () => {
    const calls: string[] = [];
    await expect(
      changeVaultOnServer(fakeSync(calls), async () => {
        throw new Error("refused");
      }),
    ).rejects.toThrow("refused");
    expect(calls).toEqual([]);
  });
});
