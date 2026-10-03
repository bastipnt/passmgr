import type { MemberVault } from "@repo/schema";
import type { SyncBatch, Vault } from "@repo/store";
import { describe, expect, it, vi } from "vitest";
import { SyncManager } from "../src/sync-manager";

const vaults = [{ vaultId: "v1" } as MemberVault];
const batch: SyncBatch = { records: [], vaults, serverTimestamp: "2026-10-02T00:00:00.000Z" };

function fakeStore(vaultsChanged: boolean) {
  return {
    getSyncCursors: vi.fn(async () => ({ v1: "2026-10-01T00:00:00.000Z" })),
    applySync: vi.fn(async () => vaultsChanged),
  };
}

describe("SyncManager", () => {
  it("pulls from the stored per-vault cursors and applies the batch", async () => {
    const store = fakeStore(false);
    const fetcher = vi.fn(async () => batch);
    const manager = new SyncManager(store as unknown as Vault, fetcher);

    expect(await manager.sync()).toBe(true);

    expect(fetcher).toHaveBeenCalledWith({ v1: "2026-10-01T00:00:00.000Z" });
    expect(store.applySync).toHaveBeenCalledWith(batch);
  });

  it("reloads vault keys before notifying listeners when the vault list changed", async () => {
    const calls: string[] = [];
    const onVaultsChanged = vi.fn(async () => void calls.push("keys"));
    const manager = new SyncManager(
      fakeStore(true) as unknown as Vault,
      async () => batch,
      onVaultsChanged,
    );
    const listener = vi.fn(() => void calls.push("listener"));
    manager.onSync(listener);

    await manager.sync();

    expect(onVaultsChanged).toHaveBeenCalledWith(vaults);
    expect(listener).toHaveBeenCalledWith({ vaultsChanged: true });
    expect(calls).toEqual(["keys", "listener"]);
  });

  it("leaves the keys alone when the vault list is unchanged", async () => {
    const onVaultsChanged = vi.fn();
    const manager = new SyncManager(
      fakeStore(false) as unknown as Vault,
      async () => batch,
      onVaultsChanged,
    );
    const listener = vi.fn();
    manager.onSync(listener);

    await manager.sync();

    expect(onVaultsChanged).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith({ vaultsChanged: false });
  });

  it("reports a failed pull without applying anything", async () => {
    const store = fakeStore(false);
    const manager = new SyncManager(store as unknown as Vault, async () => {
      throw new Error("offline");
    });

    expect(await manager.sync()).toBe(false);
    expect(store.applySync).not.toHaveBeenCalled();
  });
});
