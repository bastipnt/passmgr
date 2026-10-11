import { SESSION_SIGNED_OUT, SUBSCRIPTION_SIGNATURE_PATH } from "@repo/crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { signRequest } from "../setup/signed-request";
import { buildTestContext } from "../setup/test-context";
import { callSigned, createCaller, loginAndGetAuthKey, register } from "./_helpers";

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

    const cc1 = await callSigned(sessionId, authKey, "query", "vault.list", undefined);
    await expect(cc1.vault.list()).resolves.toBeDefined();

    await redis.flushall();

    const cc2 = await callSigned(sessionId, authKey, "query", "vault.list", undefined);
    await expect(cc2.vault.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("deleting only the session key (TTL expiry simulation) rejects subsequent calls", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    expect(await redis.exists(`session:${sessionId}`)).toBe(1);
    await redis.del(`session:${sessionId}`);
    expect(await redis.exists(`session:${sessionId}`)).toBe(0);

    const cc = await callSigned(sessionId, authKey, "query", "vault.list", undefined);
    await expect(cc.vault.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("two independent logins create distinct sessions, isolating eviction", async () => {
    await register(email, password);
    const a = await loginAndGetAuthKey(email, password);
    const b = await loginAndGetAuthKey(email, password);
    expect(a.sessionId).not.toBe(b.sessionId);

    await redis.del(`session:${a.sessionId}`);

    const ccA = await callSigned(a.sessionId, a.authKey, "query", "vault.list", undefined);
    await expect(ccA.vault.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const ccB = await callSigned(b.sessionId, b.authKey, "query", "vault.list", undefined);
    await expect(ccB.vault.list()).resolves.toBeDefined();
  });

  it("logout invalidates the session: subsequent signed calls are rejected", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const cc1 = await callSigned(sessionId, authKey, "mutation", "login.logout", undefined);
    await expect(cc1.login.logout()).resolves.toEqual({ ok: true });
    expect(await redis.exists(`session:${sessionId}`)).toBe(0);

    const cc2 = await callSigned(sessionId, authKey, "query", "vault.list", undefined);
    await expect(cc2.vault.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("logout of one session leaves a concurrent session intact", async () => {
    await register(email, password);
    const a = await loginAndGetAuthKey(email, password);
    const b = await loginAndGetAuthKey(email, password);

    const ccA = await callSigned(a.sessionId, a.authKey, "mutation", "login.logout", undefined);
    await expect(ccA.login.logout()).resolves.toEqual({ ok: true });

    const ccB = await callSigned(b.sessionId, b.authKey, "query", "vault.list", undefined);
    await expect(ccB.vault.list()).resolves.toBeDefined();
    expect(await redis.exists(`session:${b.sessionId}`)).toBe(1);
  });

  it("lists the signed-in devices and marks the current one", async () => {
    await register(email, password);
    const a = await loginAndGetAuthKey(email, password);
    const b = await loginAndGetAuthKey(email, password);

    const cc = await callSigned(a.sessionId, a.authKey, "query", "session.list", undefined);
    const sessions = await cc.session.list();

    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    // Only public handles leave the server.
    for (const s of sessions) {
      expect([a.sessionId, b.sessionId]).not.toContain(s.id);
    }
  });

  it("labels each session with the device name sent at login", async () => {
    await register(email, password);
    const a = await loginAndGetAuthKey(email, password, "Firefox on macOS");
    await loginAndGetAuthKey(email, password);

    const cc = await callSigned(a.sessionId, a.authKey, "query", "session.list", undefined);
    const sessions = await cc.session.list();

    expect(sessions.find((s) => s.current)?.deviceName).toBe("Firefox on macOS");
    expect(sessions.find((s) => !s.current)?.deviceName).toBeNull();
  });

  it("revokes another device by its handle", async () => {
    await register(email, password);
    const a = await loginAndGetAuthKey(email, password);
    const b = await loginAndGetAuthKey(email, password);

    const list = await callSigned(a.sessionId, a.authKey, "query", "session.list", undefined);
    const other = (await list.session.list()).find((s) => !s.current)!;

    const input = { id: other.id };
    const cc = await callSigned(a.sessionId, a.authKey, "mutation", "session.revoke", input);
    await expect(cc.session.revoke(input)).resolves.toEqual({ ok: true });

    // Signed out, not expired: the device locks instead of going offline.
    const ccB = await callSigned(b.sessionId, b.authKey, "query", "vault.list", undefined);
    await expect(ccB.vault.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: SESSION_SIGNED_OUT,
    });
  });

  it("ends the revoked device's record stream with a signedOut event", async () => {
    await register(email, password);
    const a = await loginAndGetAuthKey(email, password);
    const b = await loginAndGetAuthKey(email, password);

    const headers = await signRequest({
      authKey: b.authKey,
      sessionId: b.sessionId,
      type: "subscription",
      path: SUBSCRIPTION_SIGNATURE_PATH,
      input: {},
    });
    const ccB = createCaller(buildTestContext(headers));
    const stream = (await ccB.record.onRecordChange())[Symbol.asyncIterator]();
    // A server-side caller sees `tracked()` events as [id, data, marker].
    expect((await stream.next()).value[1]).toEqual({ type: "connected" });

    const list = await callSigned(a.sessionId, a.authKey, "query", "session.list", undefined);
    const other = (await list.session.list()).find((s) => !s.current)!;
    const input = { id: other.id };
    const cc = await callSigned(a.sessionId, a.authKey, "mutation", "session.revoke", input);
    await cc.session.revoke(input);

    expect((await stream.next()).value[1]).toEqual({ type: "signedOut" });
    expect((await stream.next()).done).toBe(true);
  });

  it("an expired session is refused without the signed-out message", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);
    await redis.del(`session:${sessionId}`);

    const cc = await callSigned(sessionId, authKey, "query", "vault.list", undefined);
    const error = await cc.vault.list().catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "UNAUTHORIZED" });
    expect(error).not.toMatchObject({ message: SESSION_SIGNED_OUT });
  });

  it("refuses to revoke a session of another user", async () => {
    await register(email, password);
    await register("bob@example.com", password);
    const a = await loginAndGetAuthKey(email, password);
    const bob = await loginAndGetAuthKey("bob@example.com", password);

    const list = await callSigned(bob.sessionId, bob.authKey, "query", "session.list", undefined);
    const [bobSession] = await list.session.list();

    const input = { id: bobSession!.id };
    const cc = await callSigned(a.sessionId, a.authKey, "mutation", "session.revoke", input);
    await expect(cc.session.revoke(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("logs out every other device and keeps this one", async () => {
    await register(email, password);
    const a = await loginAndGetAuthKey(email, password);
    const b = await loginAndGetAuthKey(email, password);
    const c = await loginAndGetAuthKey(email, password);

    const cc = await callSigned(a.sessionId, a.authKey, "mutation", "session.revokeOthers", {});
    await expect(cc.session.revokeOthers({})).resolves.toEqual({ revoked: 2 });

    for (const other of [b, c]) {
      const ccO = await callSigned(
        other.sessionId,
        other.authKey,
        "query",
        "vault.list",
        undefined,
      );
      await expect(ccO.vault.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    const ccA = await callSigned(a.sessionId, a.authKey, "query", "vault.list", undefined);
    await expect(ccA.vault.list()).resolves.toBeDefined();
  });
});
