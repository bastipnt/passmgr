import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { signRequest } from "../setup/signed-request";
import { buildTestContext } from "../setup/test-context";
import { callSigned, createCaller, loginAndGetAuthKey, putChange, register } from "./_helpers";

const email = "alice@example.com";
const password = "correct horse battery staple";

function newRecordInput(vaultId: string) {
  return { changes: [putChange(vaultId)] };
}

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
      path: "vault.list",
      input: undefined,
      timestamp: Date.now() - 6 * 60_000 - 1,
    });
    const caller = createCaller(buildTestContext(staleHeaders));
    await expect(caller.vault.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a second call that reuses the same signed bundle (same nonce)", async () => {
    await register(email, password);
    const { sessionId, authKey, vaultKeys } = await loginAndGetAuthKey(email, password);

    const input = newRecordInput(vaultKeys[0]!.vaultId);
    const headers = await signRequest({
      authKey,
      sessionId,
      type: "mutation",
      path: "record.push",
      input,
    });

    // First call succeeds and claims the nonce.
    const first = createCaller(buildTestContext(headers));
    await expect(first.record.push(input)).resolves.toMatchObject({
      results: [{ status: "applied" }],
    });

    // Verbatim replay (same sessionId / timestamp / nonce / signature / body) is rejected.
    const second = createCaller(buildTestContext(headers));
    await expect(second.record.push(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("a fresh nonce on every signed call keeps the session working", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    for (let i = 0; i < 3; i++) {
      const cc = await callSigned(sessionId, authKey, "query", "vault.list", undefined);
      await expect(cc.vault.list()).resolves.toBeDefined();
    }
  });

  it("rejects when the captured headers are reused against a different procedure", async () => {
    await register(email, password);
    const { sessionId, authKey, vaultKeys } = await loginAndGetAuthKey(email, password);

    const input = newRecordInput(vaultKeys[0]!.vaultId);
    const headers = await signRequest({
      authKey,
      sessionId,
      type: "mutation",
      path: "record.push",
      input,
    });

    // Signature was computed for record.push. Reusing the headers against
    // record.history must fail at HMAC verification (before nonce is even claimed).
    const caller = createCaller(buildTestContext(headers));
    const { recordId } = input.changes[0]!;
    await expect(caller.record.history(recordId)).rejects.toMatchObject({
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
      path: "vault.list",
      input: undefined,
    });
    const caller = createCaller(buildTestContext(headers));
    await caller.vault.list();

    const ttl = await redis.ttl(`nonce:${headers.nonce}`);
    expect(ttl).toBeGreaterThan(5 * 60);
    expect(ttl).toBeLessThanOrEqual(6 * 60);
  });
});
