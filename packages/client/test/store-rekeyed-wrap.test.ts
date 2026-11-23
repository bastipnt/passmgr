import type { AccountKeyMaterial } from "@repo/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rekeyIfBelowFloor } from "../src/account/rekey-password-keys";
import { storeRekeyedWrap } from "../src/account/store-rekeyed-wrap";
import { logError } from "../src/errors/log-error";

vi.mock("../src/account/rekey-password-keys", () => ({ rekeyIfBelowFloor: vi.fn() }));
vi.mock("../src/errors/log-error", () => ({ logError: vi.fn() }));

const trpc = {} as Parameters<typeof rekeyIfBelowFloor>[0];
const material = { encryptedAccountKey: "old" } as AccountKeyMaterial;
const rekeyed = { encryptedAccountKey: "new" } as AccountKeyMaterial;

describe("storeRekeyedWrap", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores the new wrap without touching the stored vault list", async () => {
    vi.mocked(rekeyIfBelowFloor).mockResolvedValue(rekeyed);
    const saveAccount = vi.fn().mockResolvedValue(undefined);
    await storeRekeyedWrap(trpc, { saveAccount }, "p1", "pw", material);
    expect(rekeyIfBelowFloor).toHaveBeenCalledWith(trpc, "pw", material);
    expect(saveAccount).toHaveBeenCalledWith("p1", rekeyed, null);
  });

  it("stores nothing when the wrap needed no rekey", async () => {
    vi.mocked(rekeyIfBelowFloor).mockResolvedValue(undefined);
    const saveAccount = vi.fn();
    await storeRekeyedWrap(trpc, { saveAccount }, "p1", "pw", material);
    expect(saveAccount).not.toHaveBeenCalled();
  });

  it("logs a failed store instead of throwing", async () => {
    vi.mocked(rekeyIfBelowFloor).mockResolvedValue(rekeyed);
    const saveAccount = vi.fn().mockRejectedValue(new Error("disk"));
    await expect(
      storeRekeyedWrap(trpc, { saveAccount }, "p1", "pw", material),
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      "Storing the rekeyed password wrap failed",
      expect.any(Error),
    );
  });
});
