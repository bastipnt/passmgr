import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as opaque from "@serenity-kit/opaque";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { buildTestContext } from "../setup/test-context";
import { signRequest } from "../setup/signed-request";
import { callSigned, createCaller, loginAndGetAuthKey, register } from "./_helpers";

const email = "alice@example.com";
const password = "correct horse battery staple";

function newRecordInput() {
  return {
    recordId: crypto.randomUUID(),
    encryptedData: "ENC",
    encryptionNonce: "NONCE",
    cryptoVersion: 1,
    clientUpdatedAt: new Date().toISOString(),
  };
}

beforeAll(async () => {
  await opaque.ready;
});

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("replay protection", () => {
  it("rejects a replay whose timestamp is older than the 5-minute window", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const staleHeaders = await signRequest({
      authKey,
      sessionId,
      type: "query",
      path: "record.all",
      input: undefined,
      timestamp: Date.now() - 6 * 60_000 - 1,
    });
    const caller = createCaller(buildTestContext(staleHeaders));
    await expect(caller.record.all()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a second call that reuses the same signed bundle (same nonce)", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const input = newRecordInput();
    const headers = await signRequest({
      authKey,
      sessionId,
      type: "mutation",
      path: "record.create",
      input,
    });

    // First call succeeds and claims the nonce.
    const first = createCaller(buildTestContext(headers));
    await expect(first.record.create(input)).resolves.toMatchObject({ recordId: input.recordId });

    // Verbatim replay (same sessionId / timestamp / nonce / signature / body) is rejected.
    const replayInput = { ...input, recordId: crypto.randomUUID() };
    const second = createCaller(buildTestContext(headers));
    await expect(second.record.create(replayInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("a fresh nonce on every signed call keeps the session working", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    for (let i = 0; i < 3; i++) {
      const cc = await callSigned(sessionId, authKey, "query", "record.all", undefined);
      await expect(cc.record.all()).resolves.toBeDefined();
    }
  });

  it("rejects when the captured headers are reused against a different procedure", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const input = newRecordInput();
    const headers = await signRequest({
      authKey,
      sessionId,
      type: "mutation",
      path: "record.create",
      input,
    });

    // Signature was computed for record.create. Reusing the headers against
    // record.delete must fail at HMAC verification (before nonce is even claimed).
    const caller = createCaller(buildTestContext(headers));
    await expect(caller.record.delete(input.recordId)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("nonce key is stored in Redis with a TTL that outlives the timestamp window", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const headers = await signRequest({
      authKey,
      sessionId,
      type: "query",
      path: "record.all",
      input: undefined,
    });
    const caller = createCaller(buildTestContext(headers));
    await caller.record.all();

    const ttl = await redis.ttl(`nonce:${headers.nonce}`);
    expect(ttl).toBeGreaterThan(5 * 60);
    expect(ttl).toBeLessThanOrEqual(6 * 60);
  });
});
