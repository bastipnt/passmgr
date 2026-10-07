import type { EncryptedRecordSchema, MemberVault, PushChange, PushResult } from "@repo/schema";
import type { PendingChange, SyncBatch, Vault } from "@repo/store";
import { describe, expect, it, vi } from "vitest";
import { pushBatches, SyncManager, toPushChange } from "../src/sync-manager";

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
    record: {
      recordId,
      vaultId: "v1",
      version,
      encryptedData: `ENC-${changeId}`,
      encryptionNonce: "N",
      cryptoVersion: 1,
      clientUpdatedAt: "2026-10-02T00:00:00.000Z",
    } as EncryptedRecordSchema,
  };
}

function applied(c: PushChange): PushResult {
  const version = c.baseVersion + 1;
  return {
    clientChangeId: c.clientChangeId,
    status: "applied",
    record: { recordId: c.recordId, version } as EncryptedRecordSchema,
  };
}

/** A pusher answering every change as applied, except those `answer` decides. */
function pusher(answer: (c: PushChange) => PushResult | undefined = () => undefined) {
  return vi.fn(async (changes: PushChange[]) => changes.map((c) => answer(c) ?? applied(c)));
}

const ids = (push: { mock: { calls: [PushChange[]][] } }) =>
  push.mock.calls.map(([changes]) => changes.map((c) => c.clientChangeId));

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
  it("pushes the outbox as one batch, acks each change with the server's copy, then pulls", async () => {
    const store = fakeStore(false, [change("c1", "r1", 1), change("c2", "r2", 3)]);
    const calls: string[] = [];
    const push = vi.fn(async (changes: PushChange[]) => {
      calls.push(`push ${changes.map((c) => c.clientChangeId).join(",")}`);
      return changes.map(applied);
    });
    const pull = vi.fn(async () => {
      calls.push("pull");
      return batch;
    });
    const manager = new SyncManager(store as unknown as Vault, { pull, push });

    expect(await manager.sync()).toBe(true);

    expect(calls).toEqual(["push c1,c2", "pull"]);
    expect(store.ackPendingChange).toHaveBeenCalledWith("c1", { recordId: "r1", version: 1 });
    expect(store.ackPendingChange).toHaveBeenCalledWith("c2", { recordId: "r2", version: 3 });
  });

  it("keeps a change that wasn't applied queued and pushes it again after the pull", async () => {
    const store = fakeStore(false, [
      change("c1", "r1", 2),
      change("c2", "r1", 3),
      change("c3", "r2", 1),
    ]);
    let round = 0;
    const push = vi.fn(async (changes: PushChange[]) => {
      round++;
      return changes.map(
        (c): PushResult =>
          round === 1 && c.recordId === "r1"
            ? { clientChangeId: c.clientChangeId, status: "stale", headVersion: 2 }
            : applied(c),
      );
    });
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch, push });

    expect(await manager.sync()).toBe(true);

    expect(store.failPendingChange).toHaveBeenCalledWith("c1", "stale: the server is at version 2");
    expect(store.failPendingChange).toHaveBeenCalledWith("c2", "stale: the server is at version 2");
    expect(ids(push)).toEqual([
      ["c1", "c2", "c3"],
      ["c1", "c2"],
    ]);
    expect(store.ackPendingChange).toHaveBeenCalledTimes(3);
  });

  it("fails a rejected change with its reason", async () => {
    const store = fakeStore(false, [change("c1", "r1", 1)]);
    const push = pusher((c) => ({
      clientChangeId: c.clientChangeId,
      status: "rejected",
      reason: "forbidden",
    }));
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch, push });

    await manager.sync();

    expect(store.failPendingChange).toHaveBeenCalledWith("c1", "rejected: forbidden");
    expect(store.ackPendingChange).not.toHaveBeenCalled();
  });

  it("stops the round on an error that concerns every change, without counting it", async () => {
    const store = fakeStore(false, [change("c1", "r1", 1), change("c2", "r2", 1)]);
    const push = vi.fn(async (): Promise<PushResult[]> => {
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

  it("never counts an applied change as failed when its local ack fails", async () => {
    const store = fakeStore(false, [change("c1", "r1", 1), change("c2", "r2", 1)]);
    store.ackPendingChange.mockRejectedValueOnce(new Error("disk full"));
    const push = pusher();
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch, push });

    expect(await manager.sync()).toBe(false);

    // The sync ends there: nothing is pushed again, nor counted, and c2 waits.
    expect(push).toHaveBeenCalledTimes(1);
    expect(store.ackPendingChange).toHaveBeenCalledTimes(1);
    expect(store.failPendingChange).not.toHaveBeenCalled();
  });
});

describe("toPushChange", () => {
  it("sends a pending version as a put or a delete on the version below it", () => {
    const put = change("c1", "r1", 3);
    expect(toPushChange(put)).toEqual({
      op: "put",
      clientChangeId: "c1",
      recordId: "r1",
      vaultId: "v1",
      baseVersion: 2,
      encryptedData: "ENC-c1",
      encryptionNonce: "N",
      cryptoVersion: 1,
      clientUpdatedAt: "2026-10-02T00:00:00.000Z",
    });

    const tombstone = { ...put, record: { ...put.record, deleted_at: "2026-10-02T00:00:00.000Z" } };
    expect(toPushChange(tombstone)).toEqual({
      op: "delete",
      clientChangeId: "c1",
      recordId: "r1",
      vaultId: "v1",
      baseVersion: 2,
      clientUpdatedAt: "2026-10-02T00:00:00.000Z",
    });
  });
});

describe("pushBatches", () => {
  const changeIds = (batches: PendingChange[][]) => batches.map((b) => b.map((c) => c.changeId));

  it("keeps a record's changes in one batch, in order", () => {
    const outbox = [
      change("a1", "a", 2),
      change("b1", "b", 1),
      change("a2", "a", 3),
      change("c1", "c", 1),
    ];
    expect(changeIds(pushBatches(outbox, 3))).toEqual([["a1", "a2", "b1"], ["c1"]]);
  });

  it("splits only a chain longer than a batch", () => {
    const outbox = [change("x", "x", 1), ...[1, 2, 3].map((v) => change(`a${v}`, "a", v))];
    expect(changeIds(pushBatches(outbox, 2))).toEqual([["x"], ["a1", "a2"], ["a3"]]);
  });
});
