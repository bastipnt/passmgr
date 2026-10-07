import { getPasswordKekParams, setPasswordKekParams } from "@repo/crypto";
import type {
  EncryptedRecordSchema,
  LoginRecord,
  MemberVault,
  PushChange,
  PushResult,
  RecordData,
} from "@repo/schema";
import { secretsStore, Vault } from "@repo/store";
import { createTestDriver } from "@repo/store/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateLocalVault } from "../src/account/create-local-vault";
import { RecordRepository } from "../src/records/record-repository";
import { resolveRecordConflict } from "../src/records/resolve-record-conflict";
import { SyncManager } from "../src/sync-manager";
import { decryptRecord } from "../src/util/decrypt-record";

type ServerRow = EncryptedRecordSchema & { clientChangeId: string };
type Failure = Extract<PushResult, { status: "stale" }>;

/**
 * Two devices of one user syncing through an in-memory server that applies
 * pushes like `record.push`: compare-and-swap per change, a record's changes
 * in a batch all or nothing, a retried change answered with what it stored.
 */
class FakeServer {
  rows: ServerRow[] = [];
  /** How many more pushes get through before the network drops (none: never). */
  pushesBeforeOutage: number | undefined;
  /** Runs once, right before the next push is applied (e.g. another device writes first). */
  beforeNextPush: (() => Promise<void>) | undefined;

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

  push = async (changes: PushChange[]): Promise<PushResult[]> => {
    if (this.pushesBeforeOutage !== undefined && this.pushesBeforeOutage-- <= 0) {
      throw new Error("NETWORK");
    }
    const before = this.beforeNextPush;
    this.beforeNextPush = undefined;
    await before?.();

    const results: PushResult[] = [];
    for (const recordId of new Set(changes.map((c) => c.recordId))) {
      const chain = changes.filter((c) => c.recordId === recordId);
      const staged: ServerRow[] = [];
      const answers: PushResult[] = [];
      let head = this.head(recordId);
      let failure: Failure | null = null;

      for (const change of chain) {
        const { clientChangeId } = change;
        const stored = this.rows.find(
          (r) => r.recordId === recordId && r.clientChangeId === clientChangeId,
        );
        if (stored) {
          answers.push({ clientChangeId, status: "applied", record: stored });
        } else if (failure || (head?.version ?? 0) !== change.baseVersion) {
          failure ??= {
            clientChangeId,
            status: "stale",
            headVersion: this.head(recordId)?.version ?? 0,
          };
          answers.push({ ...failure, clientChangeId });
        } else {
          const now = new Date().toISOString();
          const ciphertext = change.op === "put" ? change : head!;
          const row: ServerRow = {
            recordId,
            vaultId: change.vaultId,
            encryptedData: ciphertext.encryptedData,
            encryptionNonce: ciphertext.encryptionNonce,
            cryptoVersion: ciphertext.cryptoVersion,
            version: (head?.version ?? 0) + 1,
            clientUpdatedAt: change.clientUpdatedAt,
            clientChangeId,
            created_at: now,
            updated_at: now,
            deleted_at: change.op === "delete" ? now : null,
          };
          staged.push(row);
          head = row;
          answers.push({ clientChangeId, status: "applied", record: row });
        }
      }

      if (failure) {
        const first = failure;
        results.push(
          ...answers.map((a) =>
            a.status === "applied" && !staged.includes(a.record as ServerRow)
              ? a
              : { ...first, clientChangeId: a.clientChangeId },
          ),
        );
      } else {
        this.rows.push(...staged);
        results.push(...answers);
      }
    }
    // In the order of the changes.
    return changes.map((c) => results.find((r) => r.clientChangeId === c.clientChangeId)!);
  };
}

class Device {
  readonly vault = new Vault(createTestDriver());
  readonly records = new RecordRepository(this.vault);
  readonly sync: SyncManager;

  constructor(server: FakeServer) {
    this.sync = new SyncManager(this.vault, {
      pull: server.pull,
      push: (changes) => server.push(changes),
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

  it("pushes the losing edit and the merge together, or neither", async () => {
    clock("10:00");
    await edit(a, { note: "from A" }); // offline
    clock("10:05");
    await edit(b, { username: "bob" });
    await b.sync.sync();

    // A's first push is stale and the pull merges. Before A pushes its original
    // edit and the merge, B writes again: neither goes in, so no device ever
    // pulls A's original edit (without B's username) as the head.
    clock("10:10");
    server.beforeNextPush = async () => {
      server.beforeNextPush = async () => {
        await edit(b, { username: "bob", title: "Renamed by B" });
        await b.sync.sync();
      };
    };
    await a.sync.sync();
    expect(server.rows.map((row) => decryptRecord(row))).toMatchObject([
      { username: "jana" },
      { username: "bob" },
      { username: "bob", title: "Renamed by B" },
    ]);
    expect(await a.vault.countPendingChanges()).toBe(2);

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

  it("stores a change once when the response to its push got lost", async () => {
    clock("10:00");
    await edit(a, { note: "once" });
    const push = server.push;
    server.push = async (changes) => {
      await push(changes);
      throw new Error("NETWORK"); // stored, but the answer never arrives
    };
    await a.sync.sync();
    server.push = push;
    expect(server.rows).toHaveLength(2);
    expect(await a.vault.countPendingChanges()).toBe(1);

    await a.sync.sync();

    expect(server.rows).toHaveLength(2);
    expect(await a.vault.countPendingChanges()).toBe(0);
    expect(await a.read(recordId)).toMatchObject({ note: "once" });
  });

  it("parks a rejected change with its record's later edits, until retried", async () => {
    clock("10:00");
    await edit(a, { note: "first" });
    const push = server.push;
    server.push = async (changes) =>
      changes.map((c) => ({
        clientChangeId: c.clientChangeId,
        status: "rejected",
        reason: "forbidden",
      }));
    await a.sync.sync();
    server.push = push;

    clock("10:05");
    await edit(a, { note: "second" });
    await a.sync.sync();

    expect(server.rows).toHaveLength(1);
    expect(a.sync.getStatus()).toMatchObject({ pending: 2, parked: 1 });
    const parked = await a.vault.getParkedChanges();
    expect(parked).toHaveLength(1);
    expect(parked[0]).toMatchObject({ attempts: 1, lastError: "rejected: forbidden" });
    expect(parked[0]!.record.recordId).toBe(recordId);

    await a.sync.retryParked();
    await a.sync.sync();

    expect(server.rows).toHaveLength(3);
    expect(a.sync.getStatus()).toMatchObject({ pending: 0, parked: 0 });
    expect(await b.sync.sync()).toBe(true);
    expect(await b.read(recordId)).toMatchObject({ note: "second" });
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
    // A's delete lands on B's as one more tombstone: every push appends one version.
    expect(server.rows.map((row) => row.deleted_at !== null)).toEqual([false, true, true]);
  });

  it("restores a record deleted and restored offline while the other device deleted it", async () => {
    clock("10:00");
    await a.records.delete(recordId);
    clock("10:01");
    await edit(a, { note: "restored" }); // still offline
    clock("10:05");
    await b.records.delete(recordId);
    await b.sync.sync();

    await bothSync();

    for (const device of [a, b]) {
      expect(await device.read(recordId)).toMatchObject({ note: "restored", deleted: false });
    }
    expect(await a.vault.countPendingChanges()).toBe(0);
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
