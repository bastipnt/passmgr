import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { callSigned, loginAndGetAuthKey, register } from "./_helpers";

function newRecordInput() {
  return {
    recordId: crypto.randomUUID(),
    encryptedData: "ENC",
    encryptionNonce: "NONCE",
    cryptoVersion: 1,
    clientUpdatedAt: new Date().toISOString(),
  };
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("record router — CRUD round-trip (authenticated, real services)", () => {
  const email = "alice@example.com";
  const password = "correct horse battery staple";

  it("create → getById returns the same record", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const input = newRecordInput();
    const createCaller = await callSigned(sessionId, authKey, "mutation", "record.create", input);
    const created = await createCaller.record.create(input);
    expect(created.recordId).toBe(input.recordId);
    expect(created.version).toBe(1);

    const getCaller = await callSigned(
      sessionId,
      authKey,
      "query",
      "record.getById",
      input.recordId,
    );
    const got = await getCaller.record.getById(input.recordId);
    expect(got.recordId).toBe(input.recordId);
    expect(got.encryptedData).toBe(input.encryptedData);
  });

  it("update increments version and getById returns the latest", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const input = newRecordInput();
    let cc = await callSigned(sessionId, authKey, "mutation", "record.create", input);
    await cc.record.create(input);

    const update = {
      recordId: input.recordId,
      encryptedData: "ENC-V2",
      encryptionNonce: "NONCE-V2",
      cryptoVersion: 1,
      version: 1,
      clientUpdatedAt: new Date().toISOString(),
    };
    cc = await callSigned(sessionId, authKey, "mutation", "record.update", update);
    const updated = await cc.record.update(update);
    expect(updated.version).toBe(2);

    cc = await callSigned(sessionId, authKey, "query", "record.getById", input.recordId);
    const got = await cc.record.getById(input.recordId);
    expect(got.version).toBe(2);
    expect(got.encryptedData).toBe("ENC-V2");
  });

  it("delete soft-deletes and excludes from `all`", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const input = newRecordInput();
    let cc = await callSigned(sessionId, authKey, "mutation", "record.create", input);
    await cc.record.create(input);

    cc = await callSigned(sessionId, authKey, "mutation", "record.delete", input.recordId);
    await cc.record.delete(input.recordId);

    cc = await callSigned(sessionId, authKey, "query", "record.all", undefined);
    const { records } = await cc.record.all();
    expect(records.find((r) => r.recordId === input.recordId)).toBeUndefined();
  });

  it("history returns every version of the record", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const input = newRecordInput();
    let cc = await callSigned(sessionId, authKey, "mutation", "record.create", input);
    await cc.record.create(input);

    const update = {
      recordId: input.recordId,
      encryptedData: "ENC-V2",
      encryptionNonce: "NONCE-V2",
      cryptoVersion: 1,
      version: 1,
      clientUpdatedAt: new Date().toISOString(),
    };
    cc = await callSigned(sessionId, authKey, "mutation", "record.update", update);
    await cc.record.update(update);

    cc = await callSigned(sessionId, authKey, "query", "record.history", input.recordId);
    const history = await cc.record.history(input.recordId);
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.version).sort()).toEqual([1, 2]);
  });
});

describe("record router — cross-user isolation", () => {
  it("userA's records are invisible to userB", async () => {
    await register("a@example.com", "pwA");
    await register("b@example.com", "pwB");
    const a = await loginAndGetAuthKey("a@example.com", "pwA");
    const b = await loginAndGetAuthKey("b@example.com", "pwB");

    const input = newRecordInput();
    const aCreate = await callSigned(a.sessionId, a.authKey, "mutation", "record.create", input);
    await aCreate.record.create(input);

    const bGet = await callSigned(
      b.sessionId,
      b.authKey,
      "query",
      "record.getById",
      input.recordId,
    );
    await expect(bGet.record.getById(input.recordId)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const bAll = await callSigned(b.sessionId, b.authKey, "query", "record.all", undefined);
    const { records } = await bAll.record.all();
    expect(records.find((r) => r.recordId === input.recordId)).toBeUndefined();
  });
});
