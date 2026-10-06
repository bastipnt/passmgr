import type { EncryptedRecordSchema, MemberVault } from "@repo/schema";
import type { PendingChange, SyncBatch, Vault } from "@repo/store";
import { describe, expect, it, vi } from "vitest";
import { SyncManager } from "../src/sync-manager";

const vaults = [{ vaultId: "v1" } as MemberVault];
const batch: SyncBatch = {
  records: [],
  vaults,
  cursors: { v1: 4 },
  serverTimestamp: "2026-10-02T00:00:00.000Z",
};

function fakeStore(vaultsChanged: boolean, outbox: PendingChange[] = []) {
  const queue = [...outbox];
  return {
    getSyncCursors: vi.fn(async () => ({ v1: 3 })),
    applySync: vi.fn(async () => vaultsChanged),
    getPendingChanges: vi.fn(async () => [...queue]),
    ackPendingChange: vi.fn(async (changeId: string) => {
      queue.splice(
        queue.findIndex((c) => c.changeId === changeId),
        1,
      );
    }),
    failPendingChange: vi.fn(async () => {}),
  };
}

function change(changeId: string, recordId: string, version: number): PendingChange {
  return {
    changeId,
    attempts: 0,
    lastError: null,
    record: { recordId, version } as EncryptedRecordSchema,
  };
}

describe("SyncManager pull", () => {
  it("pulls from the stored per-vault cursors and applies the batch", async () => {
    const store = fakeStore(false);
    const pull = vi.fn(async () => batch);
    const manager = new SyncManager(store as unknown as Vault, { pull });

    expect(await manager.sync()).toBe(true);

    expect(pull).toHaveBeenCalledWith({ v1: 3 });
    expect(store.applySync).toHaveBeenCalledWith(batch, undefined);
  });

  it("reloads vault keys before notifying listeners when the vault list changed", async () => {
    const calls: string[] = [];
    const onVaultsChanged = vi.fn(async () => void calls.push("keys"));
    const manager = new SyncManager(fakeStore(true) as unknown as Vault, {
      pull: async () => batch,
      onVaultsChanged,
    });
    const listener = vi.fn(() => void calls.push("listener"));
    manager.onSync(listener);

    await manager.sync();

    expect(onVaultsChanged).toHaveBeenCalledWith(vaults);
    expect(listener).toHaveBeenCalledWith({ vaultsChanged: true });
    expect(calls).toEqual(["keys", "listener"]);
  });

  it("leaves the keys alone when the vault list is unchanged", async () => {
    const onVaultsChanged = vi.fn();
    const manager = new SyncManager(fakeStore(false) as unknown as Vault, {
      pull: async () => batch,
      onVaultsChanged,
    });
    const listener = vi.fn();
    manager.onSync(listener);

    await manager.sync();

    expect(onVaultsChanged).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith({ vaultsChanged: false });
  });

  it("reports a failed pull without applying anything", async () => {
    const store = fakeStore(false);
    const manager = new SyncManager(store as unknown as Vault, {
      pull: async () => {
        throw new Error("offline");
      },
    });

    expect(await manager.sync()).toBe(false);
    expect(store.applySync).not.toHaveBeenCalled();
  });

  it("runs once more after a sync requested while one was running", async () => {
    let release!: () => void;
    const pull = vi
      .fn<() => Promise<SyncBatch>>()
      .mockImplementationOnce(() => new Promise((r) => (release = () => r(batch))))
      .mockResolvedValue(batch);
    const manager = new SyncManager(fakeStore(false) as unknown as Vault, { pull });
    manager.setEnabled(true);

    const first = manager.sync();
    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
    expect(await manager.sync()).toBe(false);
    release();
    await first;

    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(2));
  });

  it("drops the follow-up sync when syncing was disabled meanwhile (locked, offline)", async () => {
    let release!: () => void;
    const pull = vi
      .fn<() => Promise<SyncBatch>>()
      .mockImplementationOnce(() => new Promise((r) => (release = () => r(batch))))
      .mockResolvedValue(batch);
    const manager = new SyncManager(fakeStore(false) as unknown as Vault, { pull });
    manager.setEnabled(true);

    const first = manager.sync();
    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
    manager.requestSync();
    manager.setEnabled(false);
    release();
    await first;

    await new Promise((r) => setTimeout(r, 10));
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("requestSync only syncs while enabled", async () => {
    const pull = vi.fn(async () => batch);
    const manager = new SyncManager(fakeStore(false) as unknown as Vault, { pull });

    manager.requestSync();
    expect(pull).not.toHaveBeenCalled();

    manager.setEnabled(true);
    manager.requestSync();
    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
  });
});

describe("SyncManager push", () => {
  it("pushes the outbox oldest first, acks each change, then pulls", async () => {
    const store = fakeStore(false, [change("c1", "r1", 1), change("c2", "r2", 3)]);
    const calls: string[] = [];
    const push = vi.fn(async (c: PendingChange) => {
      calls.push(`push ${c.changeId}`);
      return c.changeId === "c1" ? ({ recordId: "r1", version: 1 } as EncryptedRecordSchema) : null;
    });
    const pull = vi.fn(async () => {
      calls.push("pull");
      return batch;
    });
    const manager = new SyncManager(store as unknown as Vault, { pull, push });

    expect(await manager.sync()).toBe(true);

    expect(calls).toEqual(["push c1", "push c2", "pull"]);
    expect(store.ackPendingChange).toHaveBeenCalledWith("c1", { recordId: "r1", version: 1 });
    expect(store.ackPendingChange).toHaveBeenCalledWith("c2", null);
  });

  it("holds back a record's later changes after a failure, not other records'", async () => {
    const store = fakeStore(false, [
      change("c1", "r1", 2),
      change("c2", "r1", 3),
      change("c3", "r2", 1),
    ]);
    const push = vi.fn(async (c: PendingChange) => {
      if (c.changeId === "c1") throw new Error("CONFLICT");
      return null;
    });
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch, push });

    await manager.sync();

    expect(store.failPendingChange).toHaveBeenCalledWith("c1", "CONFLICT");
    expect(store.ackPendingChange).toHaveBeenCalledWith("c3", null);
    // The second round (after the pull) tries c1 again; c2 still waits behind it.
    expect(push.mock.calls.map(([c]) => c.changeId)).toEqual(["c1", "c3", "c1"]);
  });

  it("retries a stale change after the pull moved it up", async () => {
    const store = fakeStore(false, [change("c1", "r1", 2)]);
    const push = vi
      .fn<(c: PendingChange) => Promise<EncryptedRecordSchema | null>>()
      .mockRejectedValueOnce(new Error("CONFLICT"))
      .mockResolvedValue(null);
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch, push });

    expect(await manager.sync()).toBe(true);

    expect(push).toHaveBeenCalledTimes(2);
    expect(store.ackPendingChange).toHaveBeenCalledWith("c1", null);
  });

  it("stops the round on an error that concerns every change, without counting it", async () => {
    const store = fakeStore(false, [change("c1", "r1", 1), change("c2", "r2", 1)]);
    const push = vi.fn(async () => {
      throw new Error("offline");
    });
    const pull = vi.fn(async () => batch);
    const manager = new SyncManager(store as unknown as Vault, {
      pull,
      push,
      stopsRound: (e) => e instanceof Error && e.message === "offline",
    });

    expect(await manager.sync()).toBe(false);

    expect(push).toHaveBeenCalledTimes(1);
    expect(store.failPendingChange).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();
  });

  it("never counts a stored change as failed when its local ack fails", async () => {
    const store = fakeStore(false, [change("c1", "r1", 1), change("c2", "r2", 1)]);
    store.ackPendingChange.mockRejectedValueOnce(new Error("disk full"));
    const push = vi.fn(async () => null);
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch, push });

    expect(await manager.sync()).toBe(false);

    // The sync ends there: c1 isn't pushed again, nor counted, and c2 waits.
    expect(push).toHaveBeenCalledTimes(1);
    expect(store.failPendingChange).not.toHaveBeenCalled();
  });
});
