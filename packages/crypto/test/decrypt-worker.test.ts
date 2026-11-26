import { afterEach, describe, expect, it, vi } from "vitest";
import { genKey } from "../src/util/secrets-utils";
import { encryptRecordData, type RecordCipherContext, vaultKeyId } from "../src/vault-data";
import type { DecryptRequest } from "../src/workers/decrypt.worker";

const context: RecordCipherContext = {
  recordId: "r-1",
  vaultId: "v-1",
  cryptoVersion: 1,
  stage: "sealed",
  version: 1,
  keyVersion: 1,
  state: "live",
};

/** Loads the worker module against a stubbed `self`; `send` resolves with its reply. */
async function worker() {
  let handler: ((event: { data: unknown }) => Promise<void>) | null = null;
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const replies: unknown[] = [];
  vi.stubGlobal("self", {
    set onmessage(fn: (event: { data: unknown }) => Promise<void>) {
      handler = fn;
    },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    postMessage: (data: unknown) => replies.push(data),
  });
  vi.resetModules();
  await import("../src/workers/decrypt.worker");
  let id = 0;
  const send = async (request: DecryptRequest) => {
    await handler?.({ data: { id: id++, request } });
    return replies.at(-1);
  };
  const dispatch = (type: string, event: unknown) => {
    for (const fn of listeners.get(type) ?? []) fn(event);
  };
  return { send, dispatch };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decrypt worker", () => {
  it("decrypts with the keys from init and wipes them on wipe", async () => {
    const { send } = await worker();
    const key = genKey();
    const [encryptedData, nonce] = encryptRecordData(key, context, JSON.stringify({ title: "x" }));
    const buffer = key.slice().buffer;

    await send({ type: "init", keys: [[vaultKeyId("v-1", 1), buffer]] });
    expect(await send({ type: "decrypt", context, encryptedData, nonce })).toEqual({
      id: 1,
      result: { title: "x" },
    });

    await send({ type: "wipe" });
    expect(new Uint8Array(buffer).every((byte) => byte === 0)).toBe(true);
    expect(await send({ type: "decrypt", context, encryptedData, nonce })).toEqual({
      id: 3,
      error: "No key for vault",
    });
  });

  it("wipes the keys when an uncaught error reaches the worker global", async () => {
    const { send, dispatch } = await worker();
    const key = genKey();
    const [encryptedData, nonce] = encryptRecordData(key, context, JSON.stringify({ title: "x" }));
    const buffer = key.slice().buffer;

    await send({ type: "init", keys: [[vaultKeyId("v-1", 1), buffer]] });
    dispatch("error", { message: "boom" });

    expect(new Uint8Array(buffer).every((byte) => byte === 0)).toBe(true);
    expect(await send({ type: "decrypt", context, encryptedData, nonce })).toEqual({
      id: 1,
      error: "No key for vault",
    });
  });
});
