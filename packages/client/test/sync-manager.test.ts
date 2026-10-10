import {
  type EncryptedRecordSchema,
  MAX_PUSH_CHANGES,
  type MemberVault,
  type PushChange,
  type PushResult,
} from "@repo/schema";
import type { PendingChange, Vault } from "@repo/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PUSH_ATTEMPTS,
  pushBatches,
  SyncManager,
  type SyncPage,
  type SyncStatus,
  toPushChange,
} from "../src/sync-manager";

const vaults = [{ vaultId: "v1" } as MemberVault];
const batch: SyncPage = {
  records: [],
  vaults,
  cursors: { v1: 4 },
  hasMore: false,
  serverTimestamp: "2026-10-02T00:00:00.000Z",
};

function fakeStore(vaultsChanged: boolean, outbox: PendingChange[] = []) {
  const queue = [...outbox];
  const entry = (changeId: string) => queue.find((c) => c.changeId === changeId)!;
  return {
    queue,
    getSyncCursors: vi.fn(async () => ({ v1: 3 })),
    getVaults: vi.fn(async () => (vaultsChanged ? [] : vaults)),
    applySync: vi.fn(async () => vaultsChanged),
    getPendingChanges: vi.fn(async () => queue.map((c) => ({ ...c }))),
    countPendingChanges: vi.fn(async () => queue.length),
    countParkedChanges: vi.fn(async () => queue.filter((c) => c.parkedAt).length),
    ackPendingChange: vi.fn(async (changeId: string) => {
      queue.splice(
        queue.findIndex((c) => c.changeId === changeId),
        1,
      );
    }),
    failPendingChange: vi.fn(
      async (changeId: string, error: string, { count = true }: { count?: boolean } = {}) => {
        if (count) entry(changeId).attempts++;
        entry(changeId).lastError = error;
      },
    ),
    parkPendingChange: vi.fn(async (changeId: string, error: string) => {
      entry(changeId).attempts++;
      entry(changeId).lastError = error;
      entry(changeId).parkedAt = "2026-10-07T00:00:00.000Z";
    }),
    retryParkedChanges: vi.fn(async () => {
      for (const c of queue) {
        c.parkedAt = null;
        c.attempts = 0;
      }
    }),
  };
}

function change(changeId: string, recordId: string, version: number): PendingChange {
  return {
    changeId,
    attempts: 0,
    lastError: null,
    parkedAt: null,
    record: {
      recordId,
      vaultId: "v1",
      version,
      encryptedData: `ENC-${changeId}`,
      encryptionNonce: "N",
      cryptoVersion: 1,
      keyVersion: 1,
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

  it("syncFresh waits out a running round and pulls again after it", async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => (release = resolve));
    const pull = vi
      .fn<() => Promise<SyncPage>>()
      .mockImplementationOnce(async () => {
        await first;
        return batch;
      })
      .mockResolvedValue(batch);
    const manager = new SyncManager(fakeStore(false) as unknown as Vault, { pull });

    const running = manager.sync();
    const fresh = manager.syncFresh();
    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
    release();

    expect(await running).toBe(true);
    expect(await fresh).toBe(true);
    // The fresh round's own pull, not the one already under way.
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it("reloads vault keys before applying the page when the vault list changed", async () => {
    const calls: string[] = [];
    const store = fakeStore(true);
    store.applySync.mockImplementation(async () => {
      calls.push("apply");
      return true;
    });
    const onVaultsChanged = vi.fn(async () => void calls.push("keys"));
    const manager = new SyncManager(store as unknown as Vault, {
      pull: async () => batch,
      onVaultsChanged,
    });
    const listener = vi.fn(() => void calls.push("listener"));
    manager.onSync(listener);

    await manager.sync();

    expect(onVaultsChanged).toHaveBeenCalledWith(vaults);
    expect(listener).toHaveBeenCalledWith({ vaultsChanged: true });
    // The page's merges may need a key it brings (a new vault, a rotation).
    expect(calls).toEqual(["keys", "apply", "listener"]);
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

  it("pulls page after page from the cursors each one stored", async () => {
    const store = fakeStore(false);
    store.getSyncCursors.mockResolvedValueOnce({ v1: 3 }).mockResolvedValueOnce({ v1: 5 });
    const first = { ...batch, cursors: { v1: 5 }, hasMore: true };
    const pull = vi
      .fn<() => Promise<SyncPage>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValue(batch);
    const manager = new SyncManager(store as unknown as Vault, { pull });

    expect(await manager.sync()).toBe(true);

    expect(pull.mock.calls).toEqual([[{ v1: 3 }], [{ v1: 5 }]]);
    expect(store.applySync).toHaveBeenNthCalledWith(1, first, undefined);
    expect(store.applySync).toHaveBeenNthCalledWith(2, batch, undefined);
  });

  it("tells listeners of each page, reloading keys before the page that changes them", async () => {
    const calls: string[] = [];
    const store = fakeStore(false);
    store.getVaults.mockResolvedValueOnce([]);
    store.getSyncCursors.mockResolvedValueOnce({ v1: 3 }).mockResolvedValueOnce({ v1: 5 });
    store.applySync.mockImplementation(async () => {
      calls.push("apply");
      return store.applySync.mock.calls.length === 1;
    });
    const pull = vi
      .fn<() => Promise<SyncPage>>()
      .mockResolvedValueOnce({ ...batch, hasMore: true })
      .mockResolvedValue(batch);
    const onVaultsChanged = vi.fn(async () => void calls.push("keys"));
    const manager = new SyncManager(store as unknown as Vault, { pull, onVaultsChanged });
    manager.onSync(({ vaultsChanged }) => void calls.push(`listener:${vaultsChanged}`));

    await manager.sync();

    expect(calls).toEqual(["keys", "apply", "listener:true", "apply", "listener:false"]);
  });

  it("fails the round when a page claiming more moved no cursor", async () => {
    const store = fakeStore(false);
    const pull = vi.fn(async () => ({ ...batch, hasMore: true }));
    const manager = new SyncManager(store as unknown as Vault, { pull });
    manager.setEnabled(true);

    expect(await manager.sync()).toBe(false);
    expect(pull).toHaveBeenCalledTimes(1);
    expect(manager.getStatus()).toMatchObject({
      phase: "error",
      error: "the pull made no progress",
    });
    void manager.dispose();
  });

  it("keeps the pages applied before a failed one", async () => {
    const store = fakeStore(false);
    store.getSyncCursors.mockResolvedValueOnce({ v1: 3 }).mockResolvedValueOnce({ v1: 5 });
    const first = { ...batch, hasMore: true };
    const pull = vi
      .fn<() => Promise<SyncPage>>()
      .mockResolvedValueOnce(first)
      .mockRejectedValue(new Error("offline"));
    const manager = new SyncManager(store as unknown as Vault, { pull });

    expect(await manager.sync()).toBe(false);
    expect(store.applySync).toHaveBeenCalledTimes(1);
    expect(store.applySync).toHaveBeenCalledWith(first, undefined);
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
      .fn<() => Promise<SyncPage>>()
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
      .fn<() => Promise<SyncPage>>()
      .mockImplementationOnce(() => new Promise((r) => (release = () => r(batch))))
      .mockResolvedValue(batch);
    const manager = new SyncManager(fakeStore(false) as unknown as Vault, { pull });
    manager.setEnabled(true);

    const first = manager.sync();
    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
    void manager.sync();
    manager.setEnabled(false);
    release();
    await first;

    await new Promise((r) => setTimeout(r, 10));
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("requestSync only syncs while enabled, once for writes in quick succession", async () => {
    vi.useFakeTimers();
    try {
      const pull = vi.fn(async () => batch);
      const manager = new SyncManager(fakeStore(false) as unknown as Vault, { pull });

      manager.requestSync();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(pull).not.toHaveBeenCalled();

      manager.setEnabled(true);
      manager.requestSync();
      await vi.advanceTimersByTimeAsync(500);
      manager.requestSync();
      expect(pull).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(pull).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
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

    const uncounted = { count: false };
    expect(store.failPendingChange).toHaveBeenCalledWith(
      "c1",
      "stale: the server is at version 2",
      uncounted,
    );
    expect(store.failPendingChange).toHaveBeenCalledWith(
      "c2",
      "stale: the server is at version 2",
      uncounted,
    );
    expect(ids(push)).toEqual([
      ["c1", "c2", "c3"],
      ["c1", "c2"],
    ]);
    expect(store.ackPendingChange).toHaveBeenCalledTimes(3);
  });

  it("parks a rejected change with its reason", async () => {
    const store = fakeStore(false, [change("c1", "r1", 1)]);
    const push = pusher((c) => ({
      clientChangeId: c.clientChangeId,
      status: "rejected",
      reason: "forbidden",
    }));
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch, push });

    await manager.sync();

    expect(store.parkPendingChange).toHaveBeenCalledWith("c1", "rejected: forbidden");
    expect(store.failPendingChange).not.toHaveBeenCalled();
    expect(store.ackPendingChange).not.toHaveBeenCalled();
  });

  it("retries a change rejected for an old vault key, prepared again before the next push", async () => {
    const store = fakeStore(false, [change("c1", "r1", 1)]);
    let rekeyed = false;
    const prepareOutbox = vi.fn(async () => {
      // The pull between the two pushes brought the rotated key.
      if (store.applySync.mock.calls.length > 0) rekeyed = true;
    });
    const push = pusher((c) =>
      rekeyed
        ? undefined
        : { clientChangeId: c.clientChangeId, status: "rejected", reason: "key_version" },
    );
    const manager = new SyncManager(store as unknown as Vault, {
      pull: async () => batch,
      push,
      prepareOutbox,
    });

    expect(await manager.sync()).toBe(true);

    expect(prepareOutbox).toHaveBeenCalledTimes(2);
    expect(store.parkPendingChange).not.toHaveBeenCalled();
    expect(store.failPendingChange).toHaveBeenCalledWith("c1", "rejected: key_version");
    expect(ids(push)).toEqual([["c1"], ["c1"]]);
    expect(store.queue).toEqual([]);
  });

  it("pushes anyway when preparing the outbox fails", async () => {
    const store = fakeStore(false, [change("c1", "r1", 1)]);
    const push = pusher();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = new SyncManager(store as unknown as Vault, {
      pull: async () => batch,
      push,
      prepareOutbox: async () => {
        throw new Error("no key");
      },
    });

    expect(await manager.sync()).toBe(true);
    expect(ids(push)).toEqual([["c1"]]);
    warn.mockRestore();
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

describe("SyncManager poison changes", () => {
  const badRequest = new Error("BAD_REQUEST");
  /** Refuses any batch holding a change of record `bad` as a whole, like a malformed change. */
  const refusing = (bad: string) =>
    vi.fn(async (changes: PushChange[]) => {
      if (changes.some((c) => c.recordId === bad)) throw badRequest;
      return changes.map(applied);
    });

  it("splits a batch the server refuses as a whole, so the other records go through", async () => {
    const store = fakeStore(false, [
      change("a1", "a", 1),
      change("b1", "b", 1),
      change("b2", "b", 2),
      change("c1", "c", 1),
      change("d1", "d", 1),
    ]);
    const push = refusing("b");
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch, push });

    await manager.sync();

    expect(store.queue.map((c) => c.changeId)).toEqual(["b1", "b2"]);
    expect(store.failPendingChange).toHaveBeenCalledWith("b1", "BAD_REQUEST");
    expect(store.failPendingChange).toHaveBeenCalledWith("b2", "BAD_REQUEST");
    // b's chain is never split: its changes go (and fail) together.
    for (const [changes] of push.mock.calls) {
      const b = changes.filter((c) => c.recordId === "b").map((c) => c.clientChangeId);
      expect([[], ["b1", "b2"]]).toContainEqual(b);
    }
  });

  it("parks a change after it failed MAX_PUSH_ATTEMPTS pushes", async () => {
    const stuck = { ...change("b1", "b", 1), attempts: MAX_PUSH_ATTEMPTS - 2 };
    const store = fakeStore(false, [stuck]);
    const manager = new SyncManager(store as unknown as Vault, {
      pull: async () => batch,
      push: refusing("b"),
    });

    await manager.sync(); // pushes it twice: before and after the pull

    expect(store.failPendingChange).toHaveBeenCalledTimes(1);
    expect(store.parkPendingChange).toHaveBeenCalledWith("b1", "BAD_REQUEST");
    expect(store.queue[0]!.parkedAt).not.toBeNull();
  });

  it("never parks a change for being stale: the pull resolves that", async () => {
    const contended = { ...change("c1", "r1", 2), attempts: MAX_PUSH_ATTEMPTS - 1 };
    const store = fakeStore(false, [contended]);
    const push = pusher((c) => ({
      clientChangeId: c.clientChangeId,
      status: "stale",
      headVersion: 2,
    }));
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch, push });

    await manager.sync();

    expect(store.parkPendingChange).not.toHaveBeenCalled();
    expect(store.queue[0]).toMatchObject({ attempts: MAX_PUSH_ATTEMPTS - 1, parkedAt: null });
  });

  it("skips the rest of a chain too long for one batch once its first part failed", async () => {
    const chain = Array.from({ length: MAX_PUSH_CHANGES + 1 }, (_, i) =>
      change(`a${i + 1}`, "a", i + 1),
    );
    const store = fakeStore(false, [...chain, change("b1", "b", 1)]);
    const push = vi.fn(async (changes: PushChange[]) => {
      if (changes[0]!.clientChangeId === "a1") throw new Error("BAD_REQUEST");
      return changes.map(applied);
    });
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch, push });

    await manager.sync();

    // Before and after the pull: the first part fails, the tail (a501) is never sent.
    expect(
      push.mock.calls.flatMap(([changes]) => changes.map((c) => c.clientChangeId)),
    ).not.toContain(`a${MAX_PUSH_CHANGES + 1}`);
    expect(store.parkPendingChange).not.toHaveBeenCalled();
    expect(store.queue.map((c) => c.changeId)).not.toContain("b1");
  });

  it("holds back a parked change and its record's later ones, but pushes the rest", async () => {
    const parked = { ...change("a1", "a", 1), parkedAt: "2026-10-07T00:00:00.000Z" };
    const store = fakeStore(false, [parked, change("b1", "b", 1), change("a2", "a", 2)]);
    const push = pusher();
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch, push });

    expect(await manager.sync()).toBe(true);

    expect(ids(push)).toEqual([["b1"]]);
    expect(store.queue.map((c) => c.changeId)).toEqual(["a1", "a2"]);
  });

  it("pushes parked changes again after retryParked", async () => {
    const parked = { ...change("a1", "a", 1), parkedAt: "2026-10-07T00:00:00.000Z" };
    const store = fakeStore(false, [parked]);
    const push = pusher();
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch, push });
    manager.setEnabled(true);

    await manager.retryParked();

    await vi.waitFor(() => expect(store.queue).toEqual([]));
    expect(ids(push)).toEqual([["a1"]]);
  });
});

describe("SyncManager retries", () => {
  afterEach(() => void vi.useRealTimers());

  it("retries a failed round with exponential backoff and stops once it goes through", async () => {
    vi.useFakeTimers();
    const pull = vi
      .fn<() => Promise<SyncPage>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(batch);
    const manager = new SyncManager(fakeStore(false) as unknown as Vault, { pull });
    manager.setEnabled(true);

    await manager.sync();
    expect(pull).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(pull).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(pull).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(pull).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(pull).toHaveBeenCalledTimes(3);
  });

  it("retries a round that left changes queued", async () => {
    vi.useFakeTimers();
    const store = fakeStore(false, [change("c1", "r1", 2)]);
    let stale = 2;
    const push = pusher((c) =>
      stale-- > 0
        ? { clientChangeId: c.clientChangeId, status: "stale", headVersion: 2 }
        : undefined,
    );
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch, push });
    manager.setEnabled(true);

    expect(await manager.sync()).toBe(true);
    expect(store.queue).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(store.queue).toEqual([]);
  });

  it("doesn't retry once disabled", async () => {
    vi.useFakeTimers();
    const pull = vi.fn(async (): Promise<SyncPage> => {
      throw new Error("down");
    });
    const manager = new SyncManager(fakeStore(false) as unknown as Vault, { pull });
    manager.setEnabled(true);

    await manager.sync();
    manager.setEnabled(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(pull).toHaveBeenCalledTimes(1);
  });
});

describe("SyncManager status", () => {
  function track(manager: SyncManager) {
    const phases: SyncStatus["phase"][] = [];
    manager.onStatusChange((status) => {
      if (phases.at(-1) !== status.phase) phases.push(status.phase);
    });
    return phases;
  }

  it("is offline until enabled, then reports syncing → idle with the outbox counts", async () => {
    const parked = { ...change("p1", "p", 1), parkedAt: "2026-10-07T00:00:00.000Z" };
    const store = fakeStore(false, [parked, change("c1", "r1", 1)]);
    const manager = new SyncManager(store as unknown as Vault, {
      pull: async () => batch,
      push: pusher(),
    });
    expect(manager.getStatus().phase).toBe("offline");
    const phases = track(manager);

    manager.setEnabled(true);
    await manager.sync();

    expect(phases).toEqual(["idle", "syncing", "idle"]);
    expect(manager.getStatus()).toMatchObject({ pending: 1, parked: 1, error: null });
    expect(manager.getStatus().lastSyncedAt).not.toBeNull();
  });

  it("counts a local write while offline", async () => {
    const store = fakeStore(false);
    const manager = new SyncManager(store as unknown as Vault, { pull: async () => batch });

    store.queue.push(change("c1", "r1", 1));
    manager.requestSync();

    await vi.waitFor(() =>
      expect(manager.getStatus()).toMatchObject({ phase: "offline", pending: 1 }),
    );
  });

  it("goes offline when disposed", async () => {
    const manager = new SyncManager(fakeStore(false) as unknown as Vault, {
      pull: async () => batch,
    });
    manager.setEnabled(true);
    expect(manager.getStatus().phase).toBe("idle");

    void manager.dispose();

    expect(manager.getStatus().phase).toBe("offline");
  });

  it("disposing waits for the running round and starts no new one", async () => {
    let answer!: (page: SyncPage) => void;
    const pull = vi.fn(
      () =>
        new Promise<SyncPage>((resolve) => {
          answer = resolve;
        }),
    );
    const manager = new SyncManager(fakeStore(false) as unknown as Vault, { pull });
    manager.setEnabled(true);
    const round = manager.sync();
    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(1));

    let disposed = false;
    const disposing = manager.dispose().then(() => {
      disposed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(disposed).toBe(false);

    answer(batch);
    await disposing;
    expect(await round).toBe(true);
    expect(await manager.sync()).toBe(false);
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("stops pulling further pages once disposed", async () => {
    const pull = vi.fn(async (): Promise<SyncPage> => ({ ...batch, hasMore: true }));
    const store = fakeStore(false);
    // Every page moves the cursor: only the dispose ends the round.
    let cursor = 3;
    store.getSyncCursors.mockImplementation(async () => ({ v1: cursor++ }));
    const manager = new SyncManager(store as unknown as Vault, { pull });
    const round = manager.sync();
    await manager.dispose();

    expect(await round).toBe(false);
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("tells offline apart from an error", async () => {
    const offline = new Error("offline");
    const pull = vi
      .fn<() => Promise<SyncPage>>()
      .mockRejectedValueOnce(offline)
      .mockRejectedValueOnce(new Error("INTERNAL_SERVER_ERROR"));
    const manager = new SyncManager(fakeStore(false) as unknown as Vault, {
      pull,
      isOffline: (e) => e === offline,
    });
    manager.setEnabled(true);

    await manager.sync();
    expect(manager.getStatus()).toMatchObject({ phase: "offline", error: null });

    await manager.sync();
    expect(manager.getStatus()).toMatchObject({ phase: "error", error: "INTERNAL_SERVER_ERROR" });
    void manager.dispose();
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
      keyVersion: 1,
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
