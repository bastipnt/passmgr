import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { redisMock } = vi.hoisted(() => {
  const IoRedisMock = require("ioredis-mock") as typeof import("ioredis-mock");
  return { redisMock: new IoRedisMock() };
});

vi.mock("../redis", () => ({ redis: redisMock }));

vi.mock("@repo/crypto", () =>
  import("../../test/setup/crypto-mock").then((m) => m.cryptoMockFactory()),
);

import * as opaque from "@serenity-kit/opaque";
import { db, usersTable } from "@repo/db";
import { genKey } from "@repo/crypto";
import { toBase64, UUIDV4_RE } from "@repo/util";
import { createCallerFactory } from "../trpc";
import { appRouter } from "../router";
import { buildTestContext } from "../../test/setup/test-context";
import { truncateAll } from "../../test/setup/db-helpers";
import { buildUserKeys } from "../../test/setup/user-keys";

const createCaller = createCallerFactory(appRouter);

async function register(email: string, password: string) {
  const caller = createCaller(buildTestContext(undefined));
  const { clientRegistrationState, registrationRequest } = opaque.client.startRegistration({
    password,
  });
  const { registrationResponse } = await caller.register.startRegistration({
    email,
    registrationRequest,
  });
  const { registrationRecord } = opaque.client.finishRegistration({
    clientRegistrationState,
    registrationResponse,
    password,
  });
  const { recoveryKey: _r, ...userKeys } = await buildUserKeys(password);
  await caller.register.finishRegistration({ email, registrationRecord, userKeys });
}

async function loginRound(email: string, password: string) {
  const caller = createCaller(buildTestContext(undefined));
  const { clientLoginState, startLoginRequest } = opaque.client.startLogin({ password });
  const { loginResponse } = await caller.login.startLogin({ email, startLoginRequest });
  const result = opaque.client.finishLogin({ clientLoginState, loginResponse, password });
  if (!result) throw new Error("client OPAQUE finishLogin returned null");
  const { finishLoginRequest, sessionKey } = result;
  const authSalt = genKey();
  const finished = await caller.login.finishLogin({
    email,
    finishLoginRequest,
    authSalt: toBase64(authSalt),
  });
  return { finished, sessionKey, authSalt };
}

beforeAll(async () => {
  await opaque.ready;
});

beforeEach(async () => {
  await truncateAll();
  await redisMock.flushall();
});

describe("startLogin", () => {
  const email = "alice@example.com";
  const password = "correct horse battery staple";

  it("rejects with UNAUTHORIZED when user not found", async () => {
    const caller = createCaller(buildTestContext(undefined));
    const { startLoginRequest } = opaque.client.startLogin({ password });
    await expect(
      caller.login.startLogin({ email: "nobody@example.com", startLoginRequest }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("stores serverLoginState in Redis with a 5-minute TTL after a successful start", async () => {
    await register(email, password);

    const caller = createCaller(buildTestContext(undefined));
    const { startLoginRequest } = opaque.client.startLogin({ password });
    await caller.login.startLogin({ email, startLoginRequest });

    const [user] = await db.select().from(usersTable);
    const key = `login:${user!.userId}`;
    const stored = await redisMock.get(key);
    expect(stored).toBeTruthy();

    const ttl = await redisMock.ttl(key);
    // Stored TTL is 5 min (300s). Anything <=300 and >0 is correct (with a small slack).
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5 * 60);
  });
});

describe("finishLogin", () => {
  const email = "alice@example.com";
  const password = "correct horse battery staple";

  it("returns UUIDv4 sessionId + userPasswordKeys", async () => {
    await register(email, password);
    const { finished } = await loginRound(email, password);
    expect(finished.sessionId).toMatch(UUIDV4_RE);
    expect(finished.userPasswordKeys.passwordKekParams).toMatchObject({ t: expect.any(Number) });
    expect(finished.userPasswordKeys.passwordKekSalt).toHaveLength(44);
    expect(finished.userPasswordKeys.encryptedVaultKey).toHaveLength(64);
    expect(finished.userPasswordKeys.vaultKeyEncryptionNonce).toHaveLength(32);
  });

  it("creates a session in Redis with a 24-hour TTL and deletes the login attempt", async () => {
    await register(email, password);
    const { finished } = await loginRound(email, password);

    const sessionKey = `session:${finished.sessionId}`;
    const stored = await redisMock.get(sessionKey);
    expect(stored).toBeTruthy();
    const session = JSON.parse(stored!);
    expect(session.userId).toBeTruthy();
    expect(session.rawAuthKey).toBeTruthy();

    const ttl = await redisMock.ttl(sessionKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60);

    const [user] = await db.select().from(usersTable);
    const loginAttempt = await redisMock.get(`login:${user!.userId}`);
    expect(loginAttempt).toBeNull();
  });

  it("rejects when no startLogin preceded it (no Redis attempt)", async () => {
    await register(email, password);

    const caller = createCaller(buildTestContext(undefined));
    const { startLoginRequest, clientLoginState } = opaque.client.startLogin({ password });
    const { loginResponse } = await caller.login.startLogin({ email, startLoginRequest });
    const result = opaque.client.finishLogin({ clientLoginState, loginResponse, password });
    if (!result) throw new Error("client finishLogin returned null");

    // Delete the just-stored login attempt; finishLogin must then 401.
    const [user] = await db.select().from(usersTable);
    await redisMock.del(`login:${user!.userId}`);

    await expect(
      caller.login.finishLogin({
        email,
        finishLoginRequest: result.finishLoginRequest,
        authSalt: toBase64(genKey()),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects when password is wrong (OPAQUE server finishLogin throws)", async () => {
    await register(email, password);
    await expect(loginRound(email, "WRONG-PASSWORD")).rejects.toThrow();
  });
});
