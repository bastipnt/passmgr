import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { redisMock } = vi.hoisted(() => {
  const IoRedisMock = require("ioredis-mock") as typeof import("ioredis-mock");
  return { redisMock: new IoRedisMock() };
});
vi.mock("server/src/redis", () => ({ redis: redisMock }));

vi.mock("@repo/crypto", () =>
  import("server/test/setup/crypto-mock").then((m) => m.cryptoMockFactory()),
);

import * as opaque from "@serenity-kit/opaque";
import { hkdf, signHmac, verifyHmac } from "@repo/crypto";
import { fromString } from "@repo/util";
import { createCallerFactory } from "server/src/trpc";
import { appRouter } from "server/src/router";
import { buildTestContext } from "server/test/setup/test-context";
import { truncateAll } from "server/test/setup/db-helpers";
import {
  LoginFinishFailedError,
  LoginStartFailedError,
  OpaqueLoginFailedError,
  loginUser,
} from "./login";
import { generateUserKeys } from "./register";
import { callerToTrpc, withThrow } from "../test/fixtures/trpc-from-caller";

const UUIDV4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const createCaller = createCallerFactory(appRouter);

function buildRealTrpc() {
  return callerToTrpc(createCaller(buildTestContext(undefined)));
}

async function preRegister(email: string, password: string) {
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
  const { recoveryKey: _r, ...userKeys } = await generateUserKeys(password);
  await caller.register.finishRegistration({ email, registrationRecord, userKeys });
}

beforeAll(async () => {
  await opaque.ready;
});

beforeEach(async () => {
  await truncateAll();
  await redisMock.flushall();
});

describe("loginUser — success path", () => {
  const email = "alice@example.com";
  const password = "correct horse battery staple";

  it("completes the OPAQUE handshake and returns VaultUnlockInfo", async () => {
    await preRegister(email, password);

    const loginSession = vi.fn().mockResolvedValue(undefined);
    const result = await loginUser(buildRealTrpc(), loginSession, email, password);

    expect(result.email).toBe(email);
    expect(result.password).toBe(password);
    expect(result.userPasswordKeys).toBeDefined();
    expect(result.userPasswordKeys.passwordKekParams).toMatchObject({ t: expect.any(Number) });
  });

  it("calls loginSession(sessionId, sessionKey, authSalt) with a UUIDv4 sessionId and 32-byte authSalt", async () => {
    await preRegister(email, password);

    const loginSession = vi.fn().mockResolvedValue(undefined);
    await loginUser(buildRealTrpc(), loginSession, email, password);

    expect(loginSession).toHaveBeenCalledTimes(1);
    const [sessionId, sessionKey, authSalt] = loginSession.mock.calls[0]!;
    expect(sessionId).toMatch(UUIDV4_RE);
    expect(typeof sessionKey).toBe("string");
    expect(sessionKey.length).toBeGreaterThan(0);
    expect(authSalt).toBeInstanceOf(Uint8Array);
    expect(authSalt.byteLength).toBe(32);
  });

  it("the derived authKey (sessionKey + authSalt → HKDF) signs requests that verify", async () => {
    await preRegister(email, password);

    let capturedSessionKey = "";
    let capturedAuthSalt = new Uint8Array();
    const loginSession = vi.fn(async (_sid: string, sk: string, salt: Uint8Array<ArrayBuffer>) => {
      capturedSessionKey = sk;
      capturedAuthSalt = salt;
    });

    await loginUser(buildRealTrpc(), loginSession, email, password);

    // Independent HKDF chain matches what secrets-store would derive.
    const sessionSecret = await hkdf(fromString(capturedSessionKey), "sessionSecret");
    const authKey = await hkdf(sessionSecret, "sessionAuth", capturedAuthSalt);

    const msg = "query\n/record.all\n123\n{}";
    const sig = await signHmac(authKey, msg);
    expect(await verifyHmac(authKey, sig, msg)).toBe(true);
  });
});

describe("loginUser — failure paths", () => {
  const email = "bob@example.com";
  const password = "another good password";

  it("throws LoginStartFailedError when startLogin mutate fails", async () => {
    const trpc = withThrow(buildRealTrpc(), {
      path: "login.startLogin",
      error: new Error("network"),
    });
    const loginSession = vi.fn();
    await expect(loginUser(trpc, loginSession, email, password)).rejects.toBeInstanceOf(
      LoginStartFailedError,
    );
    expect(loginSession).not.toHaveBeenCalled();
  });

  it("throws OpaqueLoginFailedError when the OPAQUE client-finish returns null (wrong password)", async () => {
    await preRegister(email, password);

    await expect(
      loginUser(buildRealTrpc(), vi.fn(), email, "WRONG-PASSWORD"),
    ).rejects.toBeInstanceOf(OpaqueLoginFailedError);
  });

  it("throws LoginFinishFailedError when finishLogin mutate fails", async () => {
    await preRegister(email, password);

    const trpc = withThrow(buildRealTrpc(), {
      path: "login.finishLogin",
      error: new Error("network"),
    });

    const loginSession = vi.fn();
    await expect(loginUser(trpc, loginSession, email, password)).rejects.toBeInstanceOf(
      LoginFinishFailedError,
    );
    expect(loginSession).not.toHaveBeenCalled();
  });
});
