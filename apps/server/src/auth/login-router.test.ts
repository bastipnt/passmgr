import { genKey } from "@repo/crypto";
import { toBase64, UUIDV4_RE } from "@repo/util";
import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../../test/setup/db-helpers";
import { clientStartLogin, clientStartRegistration } from "../../test/setup/opaque-client";
import { deriveAuthKey, signRequest } from "../../test/setup/signed-request";
import { buildTestContext } from "../../test/setup/test-context";
import { buildUserKeys } from "../../test/setup/user-keys";
import { redis } from "../redis";
import { appRouter } from "../router";
import { createCallerFactory } from "../trpc";
import { LOGIN_FREE_ATTEMPTS } from "../util/redis-utils";

const createCaller = createCallerFactory(appRouter);

async function register(email: string, password: string) {
  const caller = createCaller(buildTestContext(undefined));
  const started = await clientStartRegistration(password);
  const { registrationResponse } = await caller.register.startRegistration({
    email,
    registrationRequest: started.registrationRequest,
  });
  const { registrationRecord } = await started.finish(registrationResponse, email);
  const { recoveryKey: _r, ...userKeys } = await buildUserKeys(password);
  await caller.register.finishRegistration({ email, registrationRecord, userKeys });
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

const AUTH_SALT = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/** Full client-side login; returns the finishLogin result or null if OPAQUE failed client-side. */
async function login(email: string, password: string) {
  const caller = createCaller(buildTestContext(undefined));
  const started = await clientStartLogin(password);
  const { loginResponse, attemptId } = await caller.login.startLogin({
    email,
    startLoginRequest: started.startLoginRequest,
  });
  const result = await started.finish(loginResponse, email);
  if (!result) return null;
  return caller.login.finishLogin({
    email,
    attemptId,
    finishLoginRequest: result.finishLoginRequest,
    authSalt: AUTH_SALT,
  });
}

describe("loginRouter — edge cases", () => {
  const email = "alice@example.com";
  const password = "correct horse battery staple";

  it("finishLogin → UNAUTHORIZED with the wrong password", async () => {
    await register(email, password);
    const caller = createCaller(buildTestContext(undefined));
    const started = await clientStartLogin("WRONG-PASSWORD");
    const { loginResponse, attemptId } = await caller.login.startLogin({
      email,
      startLoginRequest: started.startLoginRequest,
    });
    const result = await started.finish(loginResponse, email);
    // OPAQUE may reject client-side (null return) or server-side — both are correct.
    if (!result) return;
    await expect(
      caller.login.finishLogin({
        email,
        attemptId,
        finishLoginRequest: result.finishLoginRequest,
        authSalt: AUTH_SALT,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("startLogin → BAD_REQUEST on malformed input (Zod)", async () => {
    const caller = createCaller(buildTestContext(undefined));
    await expect(
      // @ts-expect-error — deliberately bypassing input type to test runtime validation.
      caller.login.startLogin({ email: "not-an-email", startLoginRequest: 42 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("loginRouter — user enumeration", () => {
  const password = "correct horse battery staple";

  it("startLogin answers an unknown email with a well-formed KE2, like a known one", async () => {
    await register("alice@example.com", password);
    const caller = createCaller(buildTestContext(undefined));

    const known = await caller.login.startLogin({
      email: "alice@example.com",
      startLoginRequest: (await clientStartLogin(password)).startLoginRequest,
    });
    const unknown = await caller.login.startLogin({
      email: "nobody@example.com",
      startLoginRequest: (await clientStartLogin(password)).startLoginRequest,
    });

    expect(unknown.attemptId).toMatch(UUIDV4_RE);
    expect(unknown.loginResponse.length).toBe(known.loginResponse.length);
  });

  it("unknown email fails client-side exactly like a wrong password", async () => {
    await expect(login("nobody@example.com", password)).resolves.toBeNull();
  });

  it("finishLogin on a fake attempt → UNAUTHORIZED", async () => {
    const caller = createCaller(buildTestContext(undefined));
    const { attemptId } = await caller.login.startLogin({
      email: "nobody@example.com",
      startLoginRequest: (await clientStartLogin(password)).startLoginRequest,
    });
    // Replay a real user's KE3 against the fake attempt.
    await register("alice@example.com", password);
    const started = await clientStartLogin(password);
    const { loginResponse } = await caller.login.startLogin({
      email: "alice@example.com",
      startLoginRequest: started.startLoginRequest,
    });
    const result = await started.finish(loginResponse, "alice@example.com");
    if (!result) throw new Error("OPAQUE authFinish failed");
    await expect(
      caller.login.finishLogin({
        email: "nobody@example.com",
        attemptId,
        finishLoginRequest: result.finishLoginRequest,
        authSalt: AUTH_SALT,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("loginRouter — login attempts", () => {
  const email = "alice@example.com";
  const password = "correct horse battery staple";

  it("a third party's startLogin does not break the victim's in-flight login", async () => {
    await register(email, password);
    const caller = createCaller(buildTestContext(undefined));

    const victim = await clientStartLogin(password);
    const { loginResponse, attemptId } = await caller.login.startLogin({
      email,
      startLoginRequest: victim.startLoginRequest,
    });

    // Attacker spams startLogin for the same email in between.
    await caller.login.startLogin({
      email,
      startLoginRequest: (await clientStartLogin("guess")).startLoginRequest,
    });

    const result = await victim.finish(loginResponse, email);
    if (!result) throw new Error("OPAQUE authFinish failed");
    const finished = await caller.login.finishLogin({
      email,
      attemptId,
      finishLoginRequest: result.finishLoginRequest,
      authSalt: AUTH_SALT,
    });
    expect(finished.sessionId).toMatch(UUIDV4_RE);
  });

  it("an attempt id can only be finished once", async () => {
    await register(email, password);
    const caller = createCaller(buildTestContext(undefined));
    const started = await clientStartLogin(password);
    const { loginResponse, attemptId } = await caller.login.startLogin({
      email,
      startLoginRequest: started.startLoginRequest,
    });
    const result = await started.finish(loginResponse, email);
    if (!result) throw new Error("OPAQUE authFinish failed");
    const input = {
      email,
      attemptId,
      finishLoginRequest: result.finishLoginRequest,
      authSalt: AUTH_SALT,
    };

    await caller.login.finishLogin(input);
    await expect(caller.login.finishLogin(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("an attempt id is bound to its email", async () => {
    await register(email, password);
    await register("bob@example.com", password);
    const caller = createCaller(buildTestContext(undefined));
    const started = await clientStartLogin(password);
    const { loginResponse, attemptId } = await caller.login.startLogin({
      email,
      startLoginRequest: started.startLoginRequest,
    });
    const result = await started.finish(loginResponse, email);
    if (!result) throw new Error("OPAQUE authFinish failed");
    await expect(
      caller.login.finishLogin({
        email: "bob@example.com",
        attemptId,
        finishLoginRequest: result.finishLoginRequest,
        authSalt: AUTH_SALT,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("loginRouter — per-account throttling", () => {
  const email = "alice@example.com";
  const password = "correct horse battery staple";

  async function startLogins(target: string, n: number) {
    const caller = createCaller(buildTestContext(undefined));
    const { startLoginRequest } = await clientStartLogin(password);
    for (let i = 0; i < n; i++) {
      await caller.login.startLogin({ email: target, startLoginRequest });
    }
  }

  it.each([
    ["known", email],
    ["unknown", "nobody@example.com"],
  ])("locks a %s email after the free attempts are used up", async (_label, target) => {
    await register(email, password);
    await startLogins(target, LOGIN_FREE_ATTEMPTS + 1);
    await expect(startLogins(target, 1)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("does not affect other accounts", async () => {
    await register(email, password);
    await startLogins("mallory@example.com", LOGIN_FREE_ATTEMPTS + 1);
    await expect(login(email, password)).resolves.toMatchObject({
      sessionId: expect.stringMatching(UUIDV4_RE),
    });
  });

  it("a successful login resets the counter", async () => {
    await register(email, password);
    await startLogins(email, LOGIN_FREE_ATTEMPTS - 1);
    await login(email, password);
    await startLogins(email, LOGIN_FREE_ATTEMPTS);
    await expect(login(email, password)).resolves.toMatchObject({
      sessionId: expect.stringMatching(UUIDV4_RE),
    });
  });
});

describe("loginRouter — logout", () => {
  const SESSION_ID = "11111111-1111-1111-1111-111111111111";
  const SESSION_KEY = "deterministic-session-key";

  async function seedSession(): Promise<{ authKey: Uint8Array }> {
    const authSalt = genKey();
    const authKey = await deriveAuthKey(SESSION_KEY, authSalt);
    await redis.set(
      `session:${SESSION_ID}`,
      JSON.stringify({ userId: "user-A", rawAuthKey: toBase64(authKey) }),
      "EX",
      3600,
    );
    return { authKey };
  }

  it("deletes the Redis session and returns ok", async () => {
    const { authKey } = await seedSession();
    const headers = await signRequest({
      authKey,
      sessionId: SESSION_ID,
      type: "mutation",
      path: "login.logout",
      input: undefined,
    });
    const caller = createCaller(buildTestContext(headers));
    await expect(caller.login.logout()).resolves.toEqual({ ok: true });
    expect(await redis.exists(`session:${SESSION_ID}`)).toBe(0);
  });

  it("logout without auth headers → UNAUTHORIZED", async () => {
    await seedSession();
    const caller = createCaller(buildTestContext(undefined));
    await expect(caller.login.logout()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await redis.exists(`session:${SESSION_ID}`)).toBe(1);
  });
});
