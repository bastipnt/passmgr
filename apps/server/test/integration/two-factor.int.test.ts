import { genKey, getToken } from "@repo/crypto";
import { db, userBackupCodesTable, usersTable, userTotpTable } from "@repo/db";
import { SECOND_FACTOR_EXPIRED, SECOND_FACTOR_INVALID } from "@repo/schema";
import { toBase64 } from "@repo/util";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "../../src/redis";
import { LOGIN_FREE_ATTEMPTS, revokeUserSessions } from "../../src/util/redis-utils";
import { truncateAll } from "../setup/db-helpers";
import { clientStartLogin } from "../setup/opaque-client";
import { buildTestContext } from "../setup/test-context";
import { callSigned, createCaller, loginAndGetAuthKey, register } from "./_helpers";

// Two-factor (TOTP + backup codes) for the server login: opt-in, checked only
// after a successful OPAQUE finish, and no session or keys before the code.

const email = "alice@example.com";
const password = "correct horse battery staple";

type Session = Awaited<ReturnType<typeof loginAndGetAuthKey>>;

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
  // Only Date: a code's step follows the clock, the rest runs for real.
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Move the clock to the next TOTP step, so the authenticator shows a new code. */
function nextStep() {
  vi.setSystemTime(Date.now() + 30_000);
}

async function call(session: Session, type: "mutation" | "query", path: string, input?: unknown) {
  return await callSigned(
    session.sessionId,
    session.authKey,
    type,
    path,
    input as Record<string, unknown> | undefined,
  );
}

/** Turn two-factor on from a fresh session; returns the secret and the backup codes. */
async function enable(session: Session) {
  const { secret, uri } = await (
    await call(session, "mutation", "user.startTotpEnrollment", {})
  ).user.startTotpEnrollment({});
  expect(uri).toContain(`secret=${secret}`);
  const input = { code: await getToken(secret) };
  const { backupCodes } = await (
    await call(session, "mutation", "user.confirmTotp", input)
  ).user.confirmTotp(input);
  return { secret, backupCodes };
}

/** startLogin + finishLogin with the right password; the raw finishLogin answer. */
async function finishLogin(deviceName?: string) {
  const caller = createCaller(buildTestContext(undefined, deviceName));
  const started = await clientStartLogin(password, email);
  const { loginResponse, attemptId } = await caller.login.startLogin({
    email,
    startLoginRequest: started.startLoginRequest,
  });
  const result = await started.finish(loginResponse);
  if (!result) throw new Error("OPAQUE authFinish failed");
  return await caller.login.finishLogin({
    email,
    attemptId,
    finishLoginRequest: result.finishLoginRequest,
    authSalt: toBase64(genKey()),
  });
}

async function challenge(deviceName?: string) {
  const finished = await finishLogin(deviceName);
  if (!("secondFactorRequired" in finished)) throw new Error("expected a challenge");
  return finished.challengeId;
}

function verify(challengeId: string, code: string) {
  return createCaller(buildTestContext(undefined)).login.verifySecondFactor({ challengeId, code });
}

async function userId() {
  const [user] = await db.select({ userId: usersTable.userId }).from(usersTable);
  return user!.userId;
}

async function emailHash() {
  const [user] = await db.select({ emailHash: usersTable.emailHash }).from(usersTable);
  return user!.emailHash;
}

async function sessionKeys() {
  return await redis.keys("session:*");
}

describe("two-factor login", () => {
  it("is off by default: finishLogin answers with a session, no challenge", async () => {
    await register(email, password);
    const finished = await finishLogin();
    expect(finished).toHaveProperty("sessionId");
    expect(finished).not.toHaveProperty("secondFactorRequired");
  });

  it("with TOTP on, finishLogin hands out no session and no keys, only a challenge", async () => {
    await register(email, password);
    await enable(await loginAndGetAuthKey(email, password));
    await redis.flushall();

    const finished = await finishLogin();
    expect(Object.keys(finished).sort()).toEqual(["challengeId", "secondFactorRequired"]);
    expect(await sessionKeys()).toEqual([]);
  });

  it("a TOTP code finishes the login: session, keys, the device name", async () => {
    await register(email, password);
    const { secret } = await enable(await loginAndGetAuthKey(email, password));
    nextStep();

    const challengeId = await challenge("Firefox on macOS");
    const done = await verify(challengeId, await getToken(secret));
    expect(done.userId).toBe(await userId());
    expect(done.vaultKeys).toHaveLength(1);
    expect(done.userPasswordKeys.encryptedAccountKey).toBeTruthy();
    const raw = await redis.get(`session:${done.sessionId}`);
    expect(JSON.parse(raw!)).toMatchObject({ deviceName: "Firefox on macOS", secondFactor: true });
  });

  it("a replayed code is refused, also for a new challenge", async () => {
    await register(email, password);
    const { secret } = await enable(await loginAndGetAuthKey(email, password));
    nextStep();
    const code = await getToken(secret);

    await verify(await challenge(), code);
    await expect(verify(await challenge(), code)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: SECOND_FACTOR_INVALID,
    });
  });

  it("the enrollment code itself can't log in (its step counts as used)", async () => {
    await register(email, password);
    const { secret } = await enable(await loginAndGetAuthKey(email, password));
    await expect(verify(await challenge(), await getToken(secret))).rejects.toMatchObject({
      message: SECOND_FACTOR_INVALID,
    });
  });

  it("a wrong code counts against the login throttle", async () => {
    await register(email, password);
    await enable(await loginAndGetAuthKey(email, password));
    const hash = await emailHash();

    const challengeId = await challenge();
    const before = Number(await redis.get(`loginthrottle:${hash}`));
    await expect(verify(challengeId, "000000")).rejects.toMatchObject({
      message: SECOND_FACTOR_INVALID,
    });
    expect(Number(await redis.get(`loginthrottle:${hash}`))).toBe(before + 1);
  });

  it("the throttle lock refuses codes, the right one too", async () => {
    await register(email, password);
    const { secret } = await enable(await loginAndGetAuthKey(email, password));
    nextStep();
    const challengeId = await challenge();
    await redis.set(`loginlock:${await emailHash()}`, "1", "PX", 60_000);

    await expect(verify(challengeId, await getToken(secret))).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("five wrong codes burn the challenge", async () => {
    await register(email, password);
    const { secret } = await enable(await loginAndGetAuthKey(email, password));
    nextStep();
    const challengeId = await challenge();
    // Don't run into the throttle lock: this checks the per-challenge cap.
    expect(LOGIN_FREE_ATTEMPTS).toBeGreaterThanOrEqual(5);

    for (let i = 0; i < 4; i++) {
      await expect(verify(challengeId, "000000")).rejects.toMatchObject({
        message: SECOND_FACTOR_INVALID,
      });
      await redis.del(`loginlock:${await emailHash()}`);
    }
    await expect(verify(challengeId, "000000")).rejects.toMatchObject({
      message: SECOND_FACTOR_EXPIRED,
    });
    await redis.del(`loginlock:${await emailHash()}`);
    await expect(verify(challengeId, await getToken(secret))).rejects.toMatchObject({
      message: SECOND_FACTOR_EXPIRED,
    });
  });

  it("a challenge is single-use and expires", async () => {
    await register(email, password);
    const { secret } = await enable(await loginAndGetAuthKey(email, password));
    nextStep();

    const used = await challenge();
    await verify(used, await getToken(secret));
    nextStep();
    await expect(verify(used, await getToken(secret))).rejects.toMatchObject({
      message: SECOND_FACTOR_EXPIRED,
    });

    const expired = await challenge();
    await redis.del(`login2fa:${expired}`);
    await expect(verify(expired, await getToken(secret))).rejects.toMatchObject({
      message: SECOND_FACTOR_EXPIRED,
    });
    expect(await redis.exists(`login2fa:${expired}`)).toBe(0);
    expect(await redis.ttl(`login2fa:${await challenge()}`)).toBeLessThanOrEqual(5 * 60);
  });

  it("a backup code logs in once", async () => {
    await register(email, password);
    const { backupCodes } = await enable(await loginAndGetAuthKey(email, password));
    expect(backupCodes).toHaveLength(10);
    expect(new Set(backupCodes).size).toBe(10);

    // Typed in upper case without the dash still counts.
    const code = backupCodes[0]!.toUpperCase().replace("-", "");
    await verify(await challenge(), code);
    await expect(verify(await challenge(), backupCodes[0]!)).rejects.toMatchObject({
      message: SECOND_FACTOR_INVALID,
    });
  });

  it("a challenge from before a password change or recovery is dead, its code not spent", async () => {
    await register(email, password);
    const { backupCodes } = await enable(await loginAndGetAuthKey(email, password));

    const challengeId = await challenge();
    await revokeUserSessions(await userId());
    await expect(verify(challengeId, backupCodes[0]!)).rejects.toMatchObject({
      message: SECOND_FACTOR_EXPIRED,
    });
    expect(await sessionKeys()).toEqual([]);
    await verify(await challenge(), backupCodes[0]!);
  });

  it("an unknown email still fails like a wrong password, without a challenge", async () => {
    const caller = createCaller(buildTestContext(undefined));
    const started = await clientStartLogin(password, "nobody@example.com");
    const { loginResponse } = await caller.login.startLogin({
      email: "nobody@example.com",
      startLoginRequest: started.startLoginRequest,
    });
    expect(await started.finish(loginResponse)).toBeNull();
  });
});

describe("two-factor management", () => {
  it("status: off, then on with codes left", async () => {
    await register(email, password);
    const session = await loginAndGetAuthKey(email, password);
    const status = async (s: Session) =>
      await (await call(s, "query", "user.twoFactorStatus")).user.twoFactorStatus();

    expect(await status(session)).toEqual({ enabled: false, backupCodesLeft: 0 });
    const { secret, backupCodes } = await enable(session);
    expect(await status(session)).toEqual({ enabled: true, backupCodesLeft: 10 });

    nextStep();
    const again = await loginAndGetAuthKey(email, password, undefined, async () => backupCodes[3]!);
    expect(await status(again)).toEqual({ enabled: true, backupCodesLeft: 9 });
    expect(secret).toBeTruthy();
  });

  it("a wrong confirmation code doesn't turn it on", async () => {
    await register(email, password);
    const session = await loginAndGetAuthKey(email, password);
    await (
      await call(session, "mutation", "user.startTotpEnrollment", {})
    ).user.startTotpEnrollment({});
    const input = { code: "000000" };
    await expect(
      (await call(session, "mutation", "user.confirmTotp", input)).user.confirmTotp(input),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await db.select().from(userTotpTable)).toEqual([]);
  });

  it("enrolling twice is refused", async () => {
    await register(email, password);
    const session = await loginAndGetAuthKey(email, password);
    await enable(session);
    await expect(
      (await call(session, "mutation", "user.startTotpEnrollment", {})).user.startTotpEnrollment(
        {},
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("disable needs a session that passed the second factor, then login is password-only", async () => {
    await register(email, password);
    const before = await loginAndGetAuthKey(email, password);
    const { secret } = await enable(before);

    // The session that enabled it never gave a login code.
    await expect(
      (await call(before, "mutation", "user.disableTotp", {})).user.disableTotp({}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    nextStep();
    const session = await loginAndGetAuthKey(email, password, undefined, () => getToken(secret));
    await (await call(session, "mutation", "user.disableTotp", {})).user.disableTotp({});

    expect(await db.select().from(userTotpTable)).toEqual([]);
    expect(await db.select().from(userBackupCodesTable)).toEqual([]);
    expect(await finishLogin()).toHaveProperty("sessionId");
  });

  it("regenerating replaces every backup code", async () => {
    await register(email, password);
    const { secret, backupCodes } = await enable(await loginAndGetAuthKey(email, password));
    nextStep();
    const session = await loginAndGetAuthKey(email, password, undefined, () => getToken(secret));

    const { backupCodes: fresh } = await (
      await call(session, "mutation", "user.regenerateBackupCodes", {})
    ).user.regenerateBackupCodes({});
    expect(fresh).toHaveLength(10);
    await expect(verify(await challenge(), backupCodes[1]!)).rejects.toMatchObject({
      message: SECOND_FACTOR_INVALID,
    });
    await verify(await challenge(), fresh[0]!);
  });

  it("deleting the account removes the second factor", async () => {
    await register(email, password);
    const { secret } = await enable(await loginAndGetAuthKey(email, password));
    nextStep();
    const session = await loginAndGetAuthKey(email, password, undefined, () => getToken(secret));
    const uid = await userId();
    await (await call(session, "mutation", "user.deleteAccount")).user.deleteAccount();

    expect(await db.select().from(userTotpTable).where(eq(userTotpTable.userId, uid))).toEqual([]);
    expect(
      await db.select().from(userBackupCodesTable).where(eq(userBackupCodesTable.userId, uid)),
    ).toEqual([]);
  });
});
