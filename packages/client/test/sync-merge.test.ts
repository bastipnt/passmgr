import { getPasswordKekParams, setPasswordKekParams } from "@repo/crypto";
import type { EncryptedRecordSchema, LoginRecord, MemberVault, RecordData } from "@repo/schema";
import { type PendingChange, secretsStore, Vault } from "@repo/store";
import { createTestDriver } from "@repo/store/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateLocalVault } from "../src/account/create-local-vault";
import { RecordRepository } from "../src/records/record-repository";
import { resolveRecordConflict } from "../src/records/resolve-record-conflict";
import { SyncManager } from "../src/sync-manager";
import { decryptRecord } from "../src/util/decrypt-record";

/**
 * Two devices of one user syncing through an in-memory server that appends
 * versions compare-and-swap, like `record.create` / `update` / `delete`.
 */
class FakeServer {
  rows: EncryptedRecordSchema[] = [];
  /** How many more pushes get through before the network drops (none: never). */
  pushesBeforeOutage: number | undefined;

  constructor(private readonly vaults: MemberVault[]) {}

  head(recordId: string) {
    return this.rows.filter((r) => r.recordId === recordId).at(-1);
  }

  pull = async () => ({
    records: [...this.rows],
    vaults: this.vaults,
    cursors: {},
    serverTimestamp: new Date().toISOString(),
  });

  push = async ({ record }: PendingChange): Promise<EncryptedRecordSchema | null> => {
    if (this.pushesBeforeOutage !== undefined && this.pushesBeforeOutage-- <= 0) {
      throw new Error("NETWORK");
    }
    const head = this.head(record.recordId);
    // Deleting a deleted record is NOT_FOUND, which the client counts as done.
    if (record.deleted_at && head?.deleted_at) return null;
    if ((head?.version ?? 0) !== record.version - 1) throw new Error("CONFLICT");
    const now = new Date().toISOString();
    const row = { ...record, created_at: now, updated_at: now, deleted_at: null };
    if (record.deleted_at) {
      this.rows.push({ ...head!, ...row, version: record.version, deleted_at: now });
      return null;
    }
    this.rows.push(row);
    return row;
  };
}

class Device {
  readonly vault = new Vault(createTestDriver());
  readonly records = new RecordRepository(this.vault);
  readonly sync: SyncManager;

  constructor(server: FakeServer) {
    this.sync = new SyncManager(this.vault, {
      pull: server.pull,
      push: server.push,
      resolveConflict: resolveRecordConflict,
    });
  }

  async read(recordId: string) {
    const row = await this.vault.getByRecordId(recordId);
    return row && { ...decryptRecord(row), deleted: row.deleted_at !== null };
  }
}

let vaults: MemberVault[];
const previousParams = getPasswordKekParams();
beforeAll(async () => {
  setPasswordKekParams({ t: 1, m: 8, p: 1 });
  const generated = await generateLocalVault("pw");
  secretsStore.unlockWithAccountKey(generated.accountKey);
  secretsStore.loadVaultKeys(generated.vaults);
  vaults = generated.vaults;
});
afterAll(() => {
  secretsStore.lock();
  setPasswordKekParams(previousParams);
});

let server: FakeServer;
let a: Device;
let b: Device;
let recordId: string;
const original: LoginRecord = { type: "login", title: "GitHub", username: "jana", password: "pw" };

function clock(hhmm: string) {
  vi.setSystemTime(new Date(`2026-10-06T${hhmm}:00.000Z`));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  server = new FakeServer(vaults);
  a = new Device(server);
  b = new Device(server);

  clock("09:00");
  recordId = (await a.records.create(original)).recordId;
  await a.sync.sync();
  await b.sync.sync();
});
afterEach(async () => {
  vi.useRealTimers();
  await a.vault.destroy();
  await b.vault.destroy();
});

const ref = () => ({ recordId, vaultId: vaults[0]!.vaultId });
const edit = (device: Device, data: Partial<RecordData>) =>
  device.records.update(ref(), { ...original, ...data } as RecordData);

async function bothSync() {
  clock("10:10");
  await a.sync.sync(); // A was offline until now
  await b.sync.sync();
}

describe("syncing a record edited on two devices", () => {
  it("keeps A's offline note and B's online username, with A's edit in the history", async () => {
    clock("10:00");
    await edit(a, { note: "from A" }); // offline
    clock("10:05");
    await edit(b, { username: "bob" });
    await b.sync.sync();

    await bothSync();

    for (const device of [a, b]) {
      expect(await device.read(recordId)).toMatchObject({ username: "bob", note: "from A" });
    }
    expect(await a.vault.countPendingChanges()).toBe(0);
    const history = server.rows.map((row) => decryptRecord(row));
    expect(history).toMatchObject([
      { username: "jana" },
      { username: "bob" },
      { username: "jana", note: "from A" }, // A's original edit
      { username: "bob", note: "from A" },
    ]);
    expect((await b.vault.getRecordHistory(recordId)).length).toBe(4);
  });

  it("gives a field changed on both devices to the later edit, not the later sync", async () => {
    clock("10:00");
    await edit(a, { username: "from-a" }); // offline, synced last
    clock("10:05");
    await edit(b, { username: "from-b" });
    await b.sync.sync();

    await bothSync();

    expect(await a.read(recordId)).toMatchObject({ username: "from-b" });
    expect(await b.read(recordId)).toMatchObject({ username: "from-b" });
  });

  it("keeps the later offline edit over an earlier online one", async () => {
    clock("09:55");
    await edit(b, { username: "from-b" });
    await b.sync.sync();
    clock("10:00");
    await edit(a, { username: "from-a" });

    await bothSync();

    expect(await b.read(recordId)).toMatchObject({ username: "from-a" });
  });

  it("merges again when the server moves on before the merge is pushed", async () => {
    clock("10:00");
    await edit(a, { note: "from A" }); // offline
    clock("10:05");
    await edit(b, { username: "bob" });
    await b.sync.sync();

    // A's first push is stale; after the pull its original edit gets through,
    // the merge on top of it doesn't.
    clock("10:10");
    server.pushesBeforeOutage = 2;
    await a.sync.sync();
    server.pushesBeforeOutage = undefined;
    expect(await a.vault.countPendingChanges()).toBe(1);

    // B builds on A's original edit, the server head for now.
    clock("10:15");
    await b.sync.sync();
    await edit(b, { username: "jana", note: "from A", title: "Renamed by B" });
    await b.sync.sync();

    clock("10:20");
    await a.sync.sync();
    await b.sync.sync();

    for (const device of [a, b]) {
      expect(await device.read(recordId)).toMatchObject({
        username: "bob",
        note: "from A",
        title: "Renamed by B",
      });
    }
    expect(await a.vault.countPendingChanges()).toBe(0);
  });

  it("keeps a record deleted on both devices deleted", async () => {
    clock("10:00");
    await a.records.delete(recordId);
    clock("10:05");
    await b.records.delete(recordId);
    await b.sync.sync();

    await bothSync();

    for (const device of [a, b]) {
      expect(await device.vault.getAllLatest()).toEqual([]);
      expect(await device.read(recordId)).toMatchObject({ deleted: true });
    }
    expect(await a.vault.countPendingChanges()).toBe(0);
    expect(server.rows.map((row) => row.deleted_at !== null)).toEqual([false, true]);
  });

  it("restores a record deleted offline but edited on the other device", async () => {
    clock("10:00");
    await a.records.delete(recordId);
    clock("10:05");
    await edit(b, { password: "new" });
    await b.sync.sync();

    await bothSync();

    for (const device of [a, b]) {
      expect(await device.read(recordId)).toMatchObject({ password: "new", deleted: false });
    }
  });

  it("restores a record deleted online but edited offline", async () => {
    clock("10:00");
    await edit(a, { note: "keep me" });
    clock("10:05");
    await b.records.delete(recordId);
    await b.sync.sync();

    await bothSync();

    for (const device of [a, b]) {
      expect(await device.read(recordId)).toMatchObject({ note: "keep me", deleted: false });
    }
  });
});
