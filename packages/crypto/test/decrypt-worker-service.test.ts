import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { genKey } from "../src/util/secrets-utils";
import { encryptRecordData, type RecordCipherContext, vaultKeyId } from "../src/vault-data";

type Posted = {
  data: { id: number; request: { type: string } & Record<string, unknown> };
  transfer: Transferable[];
};

const workers: FakeDecryptWorker[] = [];

/** Records what the service posts; the test answers or fails it by hand. */
class FakeDecryptWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string; preventDefault: () => void }) => void) | null = null;
  readonly posted: Posted[] = [];
  terminated = false;

  constructor() {
    workers.push(this);
  }

  postMessage(data: Posted["data"], transfer: Transferable[] = []) {
    this.posted.push({ data, transfer });
  }

  terminate() {
    this.terminated = true;
  }

  reply(index: number, result: unknown) {
    this.onmessage?.({ data: { id: this.posted[index]?.data.id, result } });
  }

  fail(message: string) {
    this.onerror?.({ message, preventDefault: () => {} });
  }
}

vi.mock("../src/workers/decrypt.worker.ts?worker", () => ({ default: FakeDecryptWorker }));

const context: RecordCipherContext = {
  recordId: "r-1",
  vaultId: "v-1",
  cryptoVersion: 1,
  stage: "sealed",
  version: 1,
  keyVersion: 1,
  state: "live",
};

async function service() {
  vi.resetModules();
  return (await import("../src/services/decrypt-worker-service")).decryptWorkerService;
}

beforeEach(() => {
  workers.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decryptWorkerService with a Worker", () => {
  beforeEach(() => {
    vi.stubGlobal("Worker", FakeDecryptWorker);
  });

  it("init transfers the key buffers to the worker", async () => {
    const s = await service();
    const a = genKey();
    const b = genKey();
    s.init(
      new Map([
        ["v-1/1", a],
        ["v-2/1", b],
      ]),
    );

    const [init] = workers[0]?.posted ?? [];
    expect(init?.data.request).toEqual({
      type: "init",
      keys: [
        ["v-1/1", a.buffer],
        ["v-2/1", b.buffer],
      ],
    });
    expect(init?.transfer).toEqual([a.buffer, b.buffer]);
  });

  it("resolves a decrypt with the worker's reply", async () => {
    const s = await service();
    const pending = s.decrypt(context, "enc", "nonce");
    const worker = workers[0];
    expect(worker?.posted[0]?.data.request).toEqual({
      type: "decrypt",
      context,
      encryptedData: "enc",
      nonce: "nonce",
    });
    worker?.reply(0, { title: "x" });
    expect(await pending).toEqual({ title: "x" });
  });

  it("rejects the pending decrypts on a worker error", async () => {
    const s = await service();
    s.init(new Map([["v-1/1", genKey()]]));
    const a = s.decrypt(context, "enc", "nonce");
    const b = s.decrypt(context, "enc", "nonce");
    workers[0]?.fail("404");
    await expect(a).rejects.toThrow("Decrypt worker failed: 404");
    await expect(b).rejects.toThrow("Decrypt worker failed: 404");
    expect(workers[0]?.terminated).toBe(true);
  });

  it("wipe rejects the pending decrypts and tells the worker to wipe its keys", async () => {
    const s = await service();
    const pending = s.decrypt(context, "enc", "nonce");
    s.wipe();
    await expect(pending).rejects.toThrow("Session wiped");
    expect(workers).toHaveLength(1);
    expect(workers[0]?.terminated).toBe(false);
    expect(workers[0]?.posted.at(-1)?.data.request).toEqual({ type: "wipe" });
  });

  it("wipe starts no worker when none runs", async () => {
    const s = await service();
    s.wipe();
    expect(workers).toHaveLength(0);
  });
});

describe("decryptWorkerService without a Worker (Node)", () => {
  it("decrypts in-thread with the keys from init, and none after wipe", async () => {
    const s = await service();
    const key = genKey();
    const [enc, nonce] = encryptRecordData(key, context, JSON.stringify({ title: "x" }));
    const held = key.slice();
    s.init(new Map([[vaultKeyId(context.vaultId, context.keyVersion), held]]));

    expect(await s.decrypt(context, enc, nonce)).toEqual({ title: "x" });
    s.wipe();
    expect(held.every((byte) => byte === 0)).toBe(true);
    await expect(s.decrypt(context, enc, nonce)).rejects.toThrow("No key for vault");
    expect(workers).toHaveLength(0);
  });
});
