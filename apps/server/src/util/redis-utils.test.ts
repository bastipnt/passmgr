import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../redis";
import {
  getSession,
  isSignedOut,
  listUserSessions,
  revokeOtherUserSessions,
  revokeUserSession,
  revokeUserSessions,
  SESSION_MAX_AGE_MS,
  setRecoveryAttempt,
  setSession,
  takeRecoveryAttempt,
  touchSession,
} from "./redis-utils";

beforeEach(async () => {
  await redis.flushall();
});

describe("revokeUserSessions", () => {
  it("invalidates the user's existing sessions and deletes them on access", async () => {
    const a = await setSession({ userId: "u1", rawAuthKey: "k", authenticatedAt: Date.now() - 1 });
    const b = await setSession({ userId: "u1", rawAuthKey: "k", authenticatedAt: Date.now() - 1 });

    await revokeUserSessions("u1");

    expect(await getSession(a)).toBeUndefined();
    expect(await getSession(b)).toBeUndefined();
    expect(await redis.exists(`session:${a}`)).toBe(0);
  });

  it("leaves other users' sessions alone", async () => {
    const other = await setSession({ userId: "u2", rawAuthKey: "k", authenticatedAt: Date.now() });

    await revokeUserSessions("u1");

    expect(await getSession(other)).toMatchObject({ userId: "u2" });
  });

  it("accepts sessions authenticated after the revocation", async () => {
    await revokeUserSessions("u1");
    const later = await setSession({
      userId: "u1",
      rawAuthKey: "k",
      authenticatedAt: Date.now() + 1,
    });

    expect(await getSession(later)).toMatchObject({ userId: "u1" });
  });
});

describe("session max age", () => {
  const DAY_MS = 24 * 60 * 60_000;

  it("rejects a session older than the max age, however active", async () => {
    const old = {
      userId: "u1",
      rawAuthKey: "k",
      authenticatedAt: Date.now() - SESSION_MAX_AGE_MS - 1,
    };
    // Written directly: setSession would give it no TTL left.
    await redis.set("session:old", JSON.stringify(old));
    await redis.zadd("usersessions:u1", Date.now(), "old");

    expect(await getSession("old")).toBeUndefined();
    expect(await redis.exists("session:old")).toBe(0);
    expect(await redis.zscore("usersessions:u1", "old")).toBeNull();
  });

  it("never extends the TTL past the max age", async () => {
    const session = {
      userId: "u1",
      rawAuthKey: "k",
      authenticatedAt: Date.now() - SESSION_MAX_AGE_MS + 60_000,
    };
    const id = await setSession(session);
    expect(await redis.ttl(`session:${id}`)).toBeLessThanOrEqual(60);

    await touchSession(id, session);
    expect(await redis.ttl(`session:${id}`)).toBeLessThanOrEqual(60);
  });

  it("keeps the 24h sliding TTL for a young session", async () => {
    const session = { userId: "u1", rawAuthKey: "k", authenticatedAt: Date.now() - DAY_MS };
    const id = await setSession(session);
    await redis.expire(`session:${id}`, 10);

    await touchSession(id, session);
    expect(await redis.ttl(`session:${id}`)).toBeGreaterThan(DAY_MS / 1000 - 5);
  });
});

describe("session list", () => {
  const login = (userId: string, deviceName?: string) =>
    setSession({ userId, rawAuthKey: "k", authenticatedAt: Date.now(), deviceName });

  it("lists the user's live sessions with their device names, latest activity first", async () => {
    const a = await login("u1", "Firefox on macOS");
    const b = await login("u1");
    await login("u2");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await touchSession(a, { userId: "u1", rawAuthKey: "k", authenticatedAt: Date.now() });

    const sessions = await listUserSessions("u1");

    expect(sessions.map((s) => s.sessionId)).toEqual([a, b]);
    expect(sessions[0]).toMatchObject({ deviceName: "Firefox on macOS" });
    expect(sessions[1]!.deviceName).toBeUndefined();
  });

  it("drops entries whose session expired", async () => {
    const a = await login("u1");
    await redis.del(`session:${a}`);

    expect(await listUserSessions("u1")).toEqual([]);
    expect(await redis.zcard("usersessions:u1")).toBe(0);
  });

  it("does not list a revoked session again when it is touched", async () => {
    const session = { userId: "u1", rawAuthKey: "k", authenticatedAt: Date.now() };
    const a = await setSession(session);
    await revokeUserSession("u1", a);

    await touchSession(a, session);
    expect(await redis.zscore("usersessions:u1", a)).toBeNull();
  });

  it("revokes only the user's own session", async () => {
    const other = await login("u2");

    expect(await revokeUserSession("u1", other)).toBe(false);
    expect(await getSession(other)).toBeDefined();
  });

  it("revokes every other session and keeps the current one", async () => {
    const current = await login("u1");
    const a = await login("u1");
    const b = await login("u1");
    const foreign = await login("u2");

    expect(await revokeOtherUserSessions("u1", current)).toBe(2);

    expect(await getSession(current)).toBeDefined();
    expect(await getSession(a)).toBeUndefined();
    expect(await getSession(b)).toBeUndefined();
    expect(await getSession(foreign)).toBeDefined();
    expect((await listUserSessions("u1")).map((s) => s.sessionId)).toEqual([current]);
  });

  it("marks revoked sessions signed out, a new one not", async () => {
    const a = await login("u1");
    const b = await login("u1");

    await revokeUserSession("u1", a);
    await revokeOtherUserSessions("u1", a);

    expect(await isSignedOut(a)).toBe(true);
    expect(await isSignedOut(b)).toBe(true);
    expect(await isSignedOut(await login("u1"))).toBe(false);
  });

  it("revokeUserSessions signs out all but the excepted session, which just ends", async () => {
    const changing = await login("u1");
    const other = await login("u1");

    await revokeUserSessions("u1", changing);

    expect(await getSession(changing)).toBeUndefined();
    expect(await isSignedOut(changing)).toBe(false);
    expect(await isSignedOut(other)).toBe(true);
  });

  it("revokeUserSessions empties the list", async () => {
    await login("u1");
    await revokeUserSessions("u1");

    expect(await redis.exists("usersessions:u1")).toBe(0);
    expect(await listUserSessions("u1")).toEqual([]);
  });
});

describe("recovery attempts", () => {
  it("can be taken exactly once", async () => {
    const attempt = { userId: "u1", emailHash: "h", keySetId: "ks" };
    const id = await setRecoveryAttempt(attempt);

    expect(await takeRecoveryAttempt(id)).toEqual(attempt);
    expect(await takeRecoveryAttempt(id)).toBeUndefined();
  });

  it("expire with the OPAQUE replay window", async () => {
    const id = await setRecoveryAttempt({ userId: "u1", emailHash: "h", keySetId: "ks" });
    const ttl = await redis.ttl(`recovery:${id}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5 * 60);
  });
});
