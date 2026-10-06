import type { EncryptedRecordSchema, MemberVault } from "@repo/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type RecordConflict, RecordWriteError } from "../src/schema/outbox-schema";
import { Vault } from "../src/vault";
import { createTestDriver } from "./node-sqlite-driver";

let vault: Vault;

beforeEach(() => {
  vault = new Vault(createTestDriver());
});

afterEach(async () => {
  await vault.destroy();
});

const T = "2026-10-05T00:00:00.000Z";

function ciphertext(recordId: string, data: string, vaultId = "v-personal") {
  return {
    recordId,
    vaultId,
    encryptedData: data,
    encryptionNonce: `nonce-${data}`,
    cryptoVersion: 1,
    clientUpdatedAt: T,
  };
}

function serverRow(
  recordId: string,
  version: number,
  overrides: Partial<EncryptedRecordSchema> = {},
): EncryptedRecordSchema {
  return {
    ...ciphertext(recordId, `server-${recordId}-${version}`),
    version,
    created_at: T,
    updated_at: T,
    deleted_at: null,
    ...overrides,
  };
}

function memberVault(vaultId: string, kind: MemberVault["kind"]): MemberVault {
  return {
    vaultId,
    kind,
    role: "owner",
    keyVersion: 1,
    encryptedVaultKey: `enc-${vaultId}`,
    vaultKeyEncryptionNonce: `nonce-${vaultId}`,
    encryptedMeta: `meta-${vaultId}`,
    metaEncryptionNonce: `meta-nonce-${vaultId}`,
  };
}

const personal = memberVault("v-personal", "personal");
const work = memberVault("v-work", "shared");

async function pending() {
  return (await vault.getPendingChanges()).map(({ record }) => [
    record.recordId,
    record.version,
    record.encryptedData,
  ]);
}

async function history(recordId: string) {
  return (await vault.getRecordHistory(recordId)).map((r) => [
    r.version,
    r.encryptedData,
    r.syncState,
  ]);
}

describe("writeLocalChanges", () => {
  it("writes a create as pending version 1 and enqueues it", async () => {
    const [written] = await vault.writeLocalChanges([{ kind: "create", ...ciphertext("r1", "a") }]);

    expect(written).toMatchObject({ recordId: "r1", version: 1, deleted_at: null });
    expect(await vault.getAllLatest()).toMatchObject([{ recordId: "r1", syncState: "pending" }]);
    expect(await pending()).toEqual([["r1", 1, "a"]]);
  });

  it("appends updates and a tombstone on top of the head, in write order", async () => {
    await vault.upsertRecords([serverRow("r1", 3)]);

    await vault.writeLocalChanges([{ kind: "update", ...ciphertext("r1", "b") }]);
    await vault.writeLocalChanges([{ kind: "delete", recordId: "r1", clientUpdatedAt: T }]);

    expect(await history("r1")).toEqual([
      [5, "b", "pending"], // the tombstone keeps the head's ciphertext
      [4, "b", "pending"],
      [3, "server-r1-3", "synced"],
    ]);
    expect((await vault.getByRecordId("r1"))?.deleted_at).toBe(
      (await vault.getRecordHistory("r1"))[0]?.created_at,
    );
    expect(await vault.getAllLatest()).toEqual([]);
    expect(await pending()).toEqual([
      ["r1", 4, "b"],
      ["r1", 5, "b"],
    ]);
  });

  it("restores a deleted record on update (an edit beats a delete)", async () => {
    await vault.upsertRecords([serverRow("r1", 1), serverRow("r1", 2, { deleted_at: T })]);

    await vault.writeLocalChanges([{ kind: "update", ...ciphertext("r1", "back") }]);

    expect(await vault.getAllLatest()).toMatchObject([{ version: 3, encryptedData: "back" }]);
  });

  it("writes a move (create + delete) atomically, or not at all", async () => {
    await vault.upsertRecords([serverRow("r1", 1)]);

    // The delete fails (no such record): the create must not land either.
    await expect(
      vault.writeLocalChanges([
        { kind: "create", ...ciphertext("r2", "moved", "v-work") },
        { kind: "delete", recordId: "missing", clientUpdatedAt: T },
      ]),
    ).rejects.toBeInstanceOf(RecordWriteError);
    expect(await vault.getByRecordId("r2")).toBeUndefined();
    expect(await vault.countPendingChanges()).toBe(0);

    await vault.writeLocalChanges([
      { kind: "create", ...ciphertext("r2", "moved", "v-work") },
      { kind: "delete", recordId: "r1", clientUpdatedAt: T },
    ]);
    expect((await vault.getAllLatest()).map((r) => r.recordId)).toEqual(["r2"]);
    expect(await vault.countPendingChanges()).toBe(2);
  });

  it("refuses changes that don't fit the record", async () => {
    await vault.upsertRecords([serverRow("r1", 1), serverRow("gone", 1, { deleted_at: T })]);

    const cases = [
      { kind: "create", ...ciphertext("r1", "dup") },
      { kind: "update", ...ciphertext("missing", "x") },
      { kind: "update", ...ciphertext("r1", "x", "v-work") },
      { kind: "delete", recordId: "gone", clientUpdatedAt: T },
    ] as const;
    for (const change of cases) {
      await expect(vault.writeLocalChanges([change])).rejects.toBeInstanceOf(RecordWriteError);
    }
    expect(await vault.countPendingChanges()).toBe(0);
  });
});

describe("ack / fail", () => {
  it("an ack replaces the pending row with the server's copy and dequeues it", async () => {
    await vault.writeLocalChanges([{ kind: "create", ...ciphertext("r1", "a") }]);
    const [change] = await vault.getPendingChanges();

    await vault.ackPendingChange(change!.changeId, {
      ...change!.record,
      created_at: "2026-10-06T00:00:00.000Z",
    });

    expect(await vault.countPendingChanges()).toBe(0);
    expect(await vault.getByRecordId("r1")).toMatchObject({
      version: 1,
      syncState: "synced",
      created_at: "2026-10-06T00:00:00.000Z",
    });
  });

  it("an ack without a server row only marks the row synced", async () => {
    await vault.upsertRecords([serverRow("r1", 1)]);
    await vault.writeLocalChanges([{ kind: "delete", recordId: "r1", clientUpdatedAt: T }]);
    const [change] = await vault.getPendingChanges();

    await vault.ackPendingChange(change!.changeId, null);

    expect(await history("r1")).toEqual([
      [2, "server-r1-1", "synced"],
      [1, "server-r1-1", "synced"],
    ]);
  });

  it("a failure is counted and keeps the change queued", async () => {
    await vault.writeLocalChanges([{ kind: "create", ...ciphertext("r1", "a") }]);
    const [change] = await vault.getPendingChanges();

    await vault.failPendingChange(change!.changeId, "FORBIDDEN");
    await vault.failPendingChange(change!.changeId, "NETWORK");

    expect(await vault.getPendingChanges()).toMatchObject([
      { changeId: change!.changeId, attempts: 2, lastError: "NETWORK" },
    ]);
  });
});

describe("applySync with pending changes", () => {
  it("moves a colliding pending chain above the pulled versions, keeping both edits", async () => {
    await vault.applySync({
      records: [serverRow("r1", 1)],
      vaults: [personal],
      cursors: {},
      serverTimestamp: T,
    });
    await vault.writeLocalChanges([{ kind: "update", ...ciphertext("r1", "mine-1") }]);
    await vault.writeLocalChanges([{ kind: "update", ...ciphertext("r1", "mine-2") }]);

    // Another device wrote versions 2 and 3 meanwhile.
    await vault.applySync({
      records: [serverRow("r1", 2), serverRow("r1", 3)],
      vaults: [personal],
      cursors: {},
      serverTimestamp: T,
    });

    expect(await history("r1")).toEqual([
      [5, "mine-2", "pending"],
      [4, "mine-1", "pending"],
      [3, "server-r1-3", "synced"],
      [2, "server-r1-2", "synced"],
      [1, "server-r1-1", "synced"],
    ]);
    expect(await pending()).toEqual([
      ["r1", 4, "mine-1"],
      ["r1", 5, "mine-2"],
    ]);
  });

  it("hands a resolver base, local chain and server versions, and appends its merge", async () => {
    await vault.applySync({
      records: [serverRow("r1", 1)],
      vaults: [personal],
      cursors: {},
      serverTimestamp: T,
    });
    await vault.writeLocalChanges([{ kind: "update", ...ciphertext("r1", "mine-1") }]);
    await vault.writeLocalChanges([{ kind: "update", ...ciphertext("r1", "mine-2") }]);
    const resolve = vi.fn((_conflict: RecordConflict) => ciphertext("r1", "merged"));

    await vault.applySync(
      {
        records: [serverRow("r1", 2), serverRow("r1", 3)],
        vaults: [personal],
        cursors: {},
        serverTimestamp: T,
      },
      resolve,
    );

    expect(resolve).toHaveBeenCalledTimes(1);
    const conflict = resolve.mock.calls[0]![0];
    expect(conflict.base).toMatchObject({ version: 1, encryptedData: "server-r1-1" });
    expect(conflict.local.map((r) => [r.version, r.encryptedData])).toEqual([
      [4, "mine-1"],
      [5, "mine-2"],
    ]);
    expect(conflict.remote.map((r) => r.version)).toEqual([2, 3]);
    expect(conflict.receivedAt).toBe(T);
    // The local edits stay as history, pushed before the merge.
    expect(await pending()).toEqual([
      ["r1", 4, "mine-1"],
      ["r1", 5, "mine-2"],
      ["r1", 6, "merged"],
    ]);
  });

  it("appends nothing when the resolver finds the local head is the merge", async () => {
    await vault.applySync({
      records: [serverRow("r1", 1)],
      vaults: [personal],
      cursors: {},
      serverTimestamp: T,
    });
    await vault.writeLocalChanges([{ kind: "update", ...ciphertext("r1", "mine") }]);

    await vault.applySync(
      { records: [serverRow("r1", 2)], vaults: [personal], cursors: {}, serverTimestamp: T },
      () => null,
    );

    expect(await pending()).toEqual([["r1", 3, "mine"]]);
  });

  it("keeps the plain move when the resolver throws", async () => {
    await vault.applySync({
      records: [serverRow("r1", 1)],
      vaults: [personal],
      cursors: {},
      serverTimestamp: T,
    });
    await vault.writeLocalChanges([{ kind: "update", ...ciphertext("r1", "mine") }]);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await vault.applySync(
      { records: [serverRow("r1", 2)], vaults: [personal], cursors: {}, serverTimestamp: T },
      () => {
        throw new Error("no key");
      },
    );

    expect(await history("r1")).toEqual([
      [3, "mine", "pending"],
      [2, "server-r1-2", "synced"],
      [1, "server-r1-1", "synced"],
    ]);
  });

  it("restores a record deleted here and edited on the server with the merge", async () => {
    await vault.applySync({
      records: [serverRow("r1", 1)],
      vaults: [personal],
      cursors: {},
      serverTimestamp: T,
    });
    await vault.writeLocalChanges([{ kind: "delete", recordId: "r1", clientUpdatedAt: T }]);

    await vault.applySync(
      { records: [serverRow("r1", 2)], vaults: [personal], cursors: {}, serverTimestamp: T },
      () => ciphertext("r1", "server-r1-2"),
    );

    expect(await vault.getAllLatest()).toMatchObject([
      { version: 4, encryptedData: "server-r1-2", deleted_at: null },
    ]);
  });

  it("upsertRecords never overwrites a pending version either", async () => {
    await vault.upsertRecords([serverRow("r1", 1)]);
    await vault.writeLocalChanges([{ kind: "update", ...ciphertext("r1", "mine") }]);

    await vault.upsertRecords([serverRow("r1", 2)]);

    expect(await history("r1")).toEqual([
      [3, "mine", "pending"],
      [2, "server-r1-2", "synced"],
      [1, "server-r1-1", "synced"],
    ]);
  });

  it("leaves pending versions alone when the pull doesn't reach them", async () => {
    await vault.applySync({
      records: [serverRow("r1", 1)],
      vaults: [personal],
      cursors: {},
      serverTimestamp: T,
    });
    await vault.writeLocalChanges([{ kind: "update", ...ciphertext("r1", "mine") }]);

    await vault.applySync({
      records: [serverRow("r1", 1)],
      vaults: [personal],
      cursors: {},
      serverTimestamp: T,
    });

    expect(await history("r1")).toEqual([
      [2, "mine", "pending"],
      [1, "server-r1-1", "synced"],
    ]);
  });

  it("drops the unsent changes of a vault the user lost", async () => {
    await vault.applySync({
      records: [],
      vaults: [personal, work],
      cursors: {},
      serverTimestamp: T,
    });
    await vault.writeLocalChanges([
      { kind: "create", ...ciphertext("r1", "a") },
      { kind: "create", ...ciphertext("r2", "b", "v-work") },
    ]);

    await vault.applySync({ records: [], vaults: [personal], cursors: {}, serverTimestamp: T });

    expect(await pending()).toEqual([["r1", 1, "a"]]);
  });

  it("clear() empties the outbox", async () => {
    await vault.writeLocalChanges([{ kind: "create", ...ciphertext("r1", "a") }]);

    await vault.clear();

    expect(await vault.countPendingChanges()).toBe(0);
  });
});
