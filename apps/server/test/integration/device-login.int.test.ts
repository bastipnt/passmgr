import {
  deviceLoginChallenge,
  deviceSessionKey,
  generateDeviceLoginKeyPair,
  genKey,
} from "@repo/crypto";
import { db, deviceCredentialsTable, usersTable } from "@repo/db";
import { fromBase64, toBase64 } from "@repo/util";
import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../../src/redis";
import {
  claimLoginAttempt,
  LOGIN_FREE_ATTEMPTS,
  SESSION_MAX_AGE_MS,
} from "../../src/util/redis-utils";
import { truncateAll } from "../setup/db-helpers";
import { fakeAuthenticator } from "../setup/fake-authenticator";
import { deriveAuthKey } from "../setup/signed-request";
import { buildTestContext } from "../setup/test-context";
import {
  callSigned,
  createCaller,
  enableTwoFactor,
  loginAndGetAuthKey,
  register,
} from "./_helpers";

// Device login (web biometric unlock): nothing that logs in is stored on the device. Flow: docs/architecture/auth.md
// (Web biometric unlock and device login); scope: docs/testing.md (Layer 2).

const email = "alice@example.com";
const password = "correct horse battery staple";

type Session = { sessionId: string; authKey: Uint8Array };
type Authenticator = ReturnType<typeof fakeAuthenticator>;

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

async function signed(session: Session, type: "mutation" | "query", path: string, input?: unknown) {
  return await callSigned(
    session.sessionId,
    session.authKey,
    type,
    path,
    input as Record<string, unknown> | undefined,
  );
}

async function enroll(session: Session, authenticator = fakeAuthenticator()) {
  const input = {
    credentialId: authenticator.credentialId,
    publicKey: authenticator.publicKey,
    algorithm: authenticator.algorithm,
  };
  const caller = await signed(session, "mutation", "user.registerDeviceCredential", input);
  await caller.user.registerDeviceCredential(input);
  return authenticator;
}

/** The client's side of a device login; `assert` signs the challenge (default: the authenticator). */
async function deviceLogin(
  authenticator: Authenticator,
  assert: (challenge: Uint8Array) => ReturnType<Authenticator["assert"]> = (c) =>
    authenticator.assert(c),
) {
  const { caller, input, finished, client, serverPublicKey, challenge, authSalt } =
    await finishDeviceLogin(authenticator, assert);
  if ("secondFactorRequired" in finished) throw new Error("second factor required");
  const sessionKey = await deviceSessionKey(client.privateKey, serverPublicKey, challenge);
  return {
    session: { sessionId: finished.sessionId, authKey: await deriveAuthKey(sessionKey, authSalt) },
    finished,
    retry: () => caller.login.finishDeviceLogin(input),
  };
}

async function finishDeviceLogin(
  authenticator: Authenticator,
  assert: (challenge: Uint8Array) => ReturnType<Authenticator["assert"]> = (c) =>
    authenticator.assert(c),
) {
  const caller = createCaller(buildTestContext(undefined, "Laptop"));
  const started = await caller.login.startDeviceLogin({
    credentialId: authenticator.credentialId,
  });
  const client = generateDeviceLoginKeyPair();
  const serverPublicKey = fromBase64(started.serverPublicKey);
  const challenge = deviceLoginChallenge(
    fromBase64(started.nonce),
    serverPublicKey,
    client.publicKey,
  );
  const authSalt = genKey();
  const input = {
    attemptId: started.attemptId,
    clientPublicKey: toBase64(client.publicKey),
    ...assert(challenge),
    authSalt: toBase64(authSalt),
  };
  const finished = await caller.login.finishDeviceLogin(input);
  return { caller, input, finished, client, serverPublicKey, challenge, authSalt };
}

describe("device login (real Postgres + Redis)", () => {
  it("logs in with the credential alone; both sides hold the same session key", async () => {
    await register(email, password);
    const authenticator = await enroll(await loginAndGetAuthKey(email, password));

    const { session, finished } = await deviceLogin(authenticator);

    expect(finished.vaultKeys).toHaveLength(1);
    const caller = await signed(session, "query", "user.heartbeat");
    await expect(caller.user.heartbeat()).resolves.toEqual({ ok: true });
    const [row] = await db.select().from(deviceCredentialsTable);
    expect(row).toMatchObject({ signCount: 1 });
    expect(row?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("a device login is never fresh auth: it can't register another credential", async () => {
    await register(email, password);
    const authenticator = await enroll(await loginAndGetAuthKey(email, password));
    const { session } = await deviceLogin(authenticator);

    await expect(enroll(session)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("an attempt finishes once", async () => {
    await register(email, password);
    const authenticator = await enroll(await loginAndGetAuthKey(email, password));
    const { retry } = await deviceLogin(authenticator);

    await expect(retry()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses an assertion over another challenge", async () => {
    await register(email, password);
    const authenticator = await enroll(await loginAndGetAuthKey(email, password));

    await expect(
      deviceLogin(authenticator, () => authenticator.assert(new Uint8Array(32))),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses an unknown credential and one signed by another key", async () => {
    await register(email, password);
    const authenticator = await enroll(await loginAndGetAuthKey(email, password));
    const stranger = fakeAuthenticator();

    await expect(deviceLogin(stranger)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      deviceLogin(authenticator, (c) => ({
        ...authenticator.assert(c),
        signature: stranger.assert(c).signature,
      })),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses an algorithm that doesn't match the key", async () => {
    await register(email, password);
    const session = await loginAndGetAuthKey(email, password);
    const authenticator = { ...fakeAuthenticator("ec"), algorithm: -257 };

    await expect(enroll(session, authenticator)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("revoking the device's session removes its credential", async () => {
    await register(email, password);
    const laptop = await loginAndGetAuthKey(email, password, "Laptop");
    const authenticator = await enroll(laptop);
    const phone = await loginAndGetAuthKey(email, password, "Phone");

    const list = await (await signed(phone, "query", "session.list")).session.list();
    const laptopId = list.find((s) => s.deviceName === "Laptop")?.id;
    const input = { id: laptopId };
    await (await signed(phone, "mutation", "session.revoke", input)).session.revoke(
      input as { id: string },
    );

    await expect(deviceLogin(authenticator)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("signing out the other devices removes their credentials, not this one's", async () => {
    await register(email, password);
    const other = await enroll(await loginAndGetAuthKey(email, password));
    const own = await enroll(await loginAndGetAuthKey(email, password));
    const { session } = await deviceLogin(own);

    const input = {};
    await (await signed(session, "mutation", "session.revokeOthers", input)).session.revokeOthers(
      input,
    );

    await expect(deviceLogin(other)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(deviceLogin(own)).resolves.toBeDefined();
  });

  it("removing the credential ends its logins", async () => {
    await register(email, password);
    const session = await loginAndGetAuthKey(email, password);
    const authenticator = await enroll(session);

    const input = { credentialId: authenticator.credentialId };
    await (
      await signed(session, "mutation", "user.removeDeviceCredential", input)
    ).user.removeDeviceCredential(input);

    await expect(deviceLogin(authenticator)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  async function link(session: Session, credentialId: string) {
    const input = { credentialId };
    await (
      await signed(session, "mutation", "user.linkDeviceCredential", input)
    ).user.linkDeviceCredential(input);
  }

  it("a password login on the device links its credential to that session", async () => {
    await register(email, password);
    const authenticator = await enroll(await loginAndGetAuthKey(email, password));
    // Later: the same device signs in with the password, another device too.
    const laptop = await loginAndGetAuthKey(email, password, "Laptop");
    await link(laptop, authenticator.credentialId);
    const other = await enroll(await loginAndGetAuthKey(email, password));

    const none = {};
    await (await signed(laptop, "mutation", "session.revokeOthers", none)).session.revokeOthers(
      none,
    );
    await expect(deviceLogin(other)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(deviceLogin(authenticator)).resolves.toBeDefined();

    const phone = await loginAndGetAuthKey(email, password, "Phone");
    const list = await (await signed(phone, "query", "session.list")).session.list();
    const input = { id: list.find((s) => s.deviceName === "Laptop")!.id };
    await (await signed(phone, "mutation", "session.revoke", input)).session.revoke(input);
    await expect(deviceLogin(authenticator)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("can't link another user's credential", async () => {
    await register(email, password);
    await register("bob@example.com", password);
    const authenticator = await enroll(await loginAndGetAuthKey(email, password));
    const bob = await loginAndGetAuthKey("bob@example.com", password);

    await expect(link(bob, authenticator.credentialId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("stops logging in once the last password login is too old; a password login renews it", async () => {
    await register(email, password);
    const authenticator = await enroll(await loginAndGetAuthKey(email, password));
    await db
      .update(deviceCredentialsTable)
      .set({ passwordVerifiedAt: new Date(Date.now() - SESSION_MAX_AGE_MS - 60_000) });

    await expect(deviceLogin(authenticator)).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await link(await loginAndGetAuthKey(email, password), authenticator.credentialId);
    await expect(deviceLogin(authenticator)).resolves.toBeDefined();
  });

  it("linking from an old session renews the credential only up to that session's login", async () => {
    await register(email, password);
    const authenticator = await enroll(await loginAndGetAuthKey(email, password));
    const old = await loginAndGetAuthKey(email, password);
    const loggedInAt = Date.now() - SESSION_MAX_AGE_MS + 60_000;
    const raw = JSON.parse((await redis.get(`session:${old.sessionId}`))!);
    await redis.set(
      `session:${old.sessionId}`,
      JSON.stringify({ ...raw, authenticatedAt: loggedInAt }),
    );
    await db
      .update(deviceCredentialsTable)
      .set({ passwordVerifiedAt: new Date(Date.now() - SESSION_MAX_AGE_MS - 60_000) });

    await link(old, authenticator.credentialId);

    const [credential] = await db.select().from(deviceCredentialsTable);
    expect(credential!.passwordVerifiedAt.getTime()).toBe(loggedInAt);
  });

  it("linking never moves the credential's password login back", async () => {
    await register(email, password);
    const authenticator = await enroll(await loginAndGetAuthKey(email, password));
    const old = await loginAndGetAuthKey(email, password);
    const raw = JSON.parse((await redis.get(`session:${old.sessionId}`))!);
    await redis.set(
      `session:${old.sessionId}`,
      JSON.stringify({ ...raw, authenticatedAt: Date.now() - 60 * 60_000 }),
    );
    const [before] = await db.select().from(deviceCredentialsTable);

    await link(old, authenticator.credentialId);

    const [after] = await db.select().from(deviceCredentialsTable);
    expect(after!.passwordVerifiedAt).toEqual(before!.passwordVerifiedAt);
  });

  it("a device login leaves the password throttle alone", async () => {
    await register(email, password);
    const authenticator = await enroll(await loginAndGetAuthKey(email, password));
    const [user] = await db.select({ emailHash: usersTable.emailHash }).from(usersTable);
    await claimLoginAttempt(user!.emailHash);

    await deviceLogin(authenticator);

    expect(await redis.exists(`loginthrottle:${user!.emailHash}`)).toBe(1);
  });

  it("a device login's second factor leaves the password throttle alone", async () => {
    await register(email, password);
    const session = await loginAndGetAuthKey(email, password);
    const authenticator = await enroll(session);
    const { backupCodes } = await enableTwoFactor(session);
    const [user] = await db.select({ emailHash: usersTable.emailHash }).from(usersTable);
    const hash = user!.emailHash;
    for (let i = 0; i < LOGIN_FREE_ATTEMPTS; i++) await claimLoginAttempt(hash);

    const { finished } = await finishDeviceLogin(authenticator);
    if (!("secondFactorRequired" in finished)) throw new Error("expected a challenge");
    const verify = (code: string) =>
      createCaller(buildTestContext(undefined)).login.verifySecondFactor({
        challengeId: finished.challengeId,
        code,
      });
    await expect(verify("000000")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await verify(backupCodes[0]!);

    expect(await redis.get(`loginthrottle:${hash}`)).toBe(String(LOGIN_FREE_ATTEMPTS));
    expect(await redis.exists(`loginlock:${hash}`)).toBe(0);
    expect(await redis.exists(`loginthrottle:device:${hash}`)).toBe(0);
  });
});
