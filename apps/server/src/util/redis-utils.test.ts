import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../redis";
import {
  getSession,
  revokeUserSessions,
  setRecoveryAttempt,
  setSession,
  takeRecoveryAttempt,
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
    const other = await setSession({ userId: "u2", rawAuthKey: "k", authenticatedAt: 1 });

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
