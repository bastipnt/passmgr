import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { callSigned, loginAndGetAuthKey, register } from "./_helpers";

const email = "alice@example.com";
const password = "correct horse battery staple";

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("session lifecycle (real Redis)", () => {
  it("creates a session with a TTL ≤ 24h after login", async () => {
    await register(email, password);
    const { sessionId } = await loginAndGetAuthKey(email, password);

    const ttl = await redis.ttl(`session:${sessionId}`);
    expect(ttl).toBeGreaterThan(24 * 60 * 60 - 5);
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it("a signed call works, but after Redis flushall the next call is rejected", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const cc1 = await callSigned(sessionId, authKey, "query", "record.all", undefined);
    await expect(cc1.record.all()).resolves.toBeDefined();

    await redis.flushall();

    const cc2 = await callSigned(sessionId, authKey, "query", "record.all", undefined);
    await expect(cc2.record.all()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("deleting only the session key (TTL expiry simulation) rejects subsequent calls", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    expect(await redis.exists(`session:${sessionId}`)).toBe(1);
    await redis.del(`session:${sessionId}`);
    expect(await redis.exists(`session:${sessionId}`)).toBe(0);

    const cc = await callSigned(sessionId, authKey, "query", "record.all", undefined);
    await expect(cc.record.all()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("two independent logins create distinct sessions, isolating eviction", async () => {
    await register(email, password);
    const a = await loginAndGetAuthKey(email, password);
    const b = await loginAndGetAuthKey(email, password);
    expect(a.sessionId).not.toBe(b.sessionId);

    await redis.del(`session:${a.sessionId}`);

    const ccA = await callSigned(a.sessionId, a.authKey, "query", "record.all", undefined);
    await expect(ccA.record.all()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const ccB = await callSigned(b.sessionId, b.authKey, "query", "record.all", undefined);
    await expect(ccB.record.all()).resolves.toBeDefined();
  });
});
