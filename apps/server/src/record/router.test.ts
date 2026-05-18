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
import { genKey } from "@repo/crypto";
import { toBase64 } from "@repo/util";
import { createCallerFactory } from "../trpc";
import { appRouter } from "../router";
import { buildTestContext } from "../../test/setup/test-context";
import { truncateAll } from "../../test/setup/db-helpers";
import { buildUserKeys } from "../../test/setup/user-keys";
import { deriveAuthKey, signRequest } from "../../test/setup/signed-request";

const createCaller = createCallerFactory(appRouter);

// TODO: is duplicate, can be put into a helper?
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

async function loginAndGetAuthKey(
  email: string,
  password: string,
): Promise<{ sessionId: string; authKey: Uint8Array }> {
  const caller = createCaller(buildTestContext(undefined));
  const { clientLoginState, startLoginRequest } = opaque.client.startLogin({ password });
  const { loginResponse } = await caller.login.startLogin({ email, startLoginRequest });
  const result = opaque.client.finishLogin({ clientLoginState, loginResponse, password });
  if (!result) throw new Error("OPAQUE finishLogin returned null");
  const authSalt = genKey();
  const finished = await caller.login.finishLogin({
    email,
    finishLoginRequest: result.finishLoginRequest,
    authSalt: toBase64(authSalt),
  });
  const authKey = await deriveAuthKey(result.sessionKey, authSalt);
  return { sessionId: finished.sessionId, authKey };
}

async function authedCallerFor(
  sessionId: string,
  authKey: Uint8Array,
  type: "mutation" | "query",
  path: string,
  input: Record<string, unknown> | string | undefined,
) {
  const headers = await signRequest({ authKey, sessionId, type, path, input });
  return createCaller(buildTestContext(headers));
}

function newRecordInput() {
  return {
    recordId: crypto.randomUUID(),
    encryptedData: "ENC",
    encryptionNonce: "NONCE",
    cryptoVersion: 1,
    clientUpdatedAt: new Date().toISOString(),
  };
}

beforeAll(async () => {
  await opaque.ready;
});

beforeEach(async () => {
  await truncateAll();
  await redisMock.flushall();
});

describe("record router — auth gating", () => {
  it("create rejects without auth headers", async () => {
    const caller = createCaller(buildTestContext(undefined));
    await expect(caller.record.create(newRecordInput())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("all rejects without auth headers", async () => {
    const caller = createCaller(buildTestContext(undefined));
    await expect(caller.record.all()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("delete rejects without auth headers", async () => {
    const caller = createCaller(buildTestContext(undefined));
    await expect(caller.record.delete(crypto.randomUUID())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("record router — CRUD round-trip (authenticated)", () => {
  const email = "alice@example.com";
  const password = "correct horse battery staple";

  it("create → getById returns the same record", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const input = newRecordInput();
    const createCallerInst = await authedCallerFor(
      sessionId,
      authKey,
      "mutation",
      "record.create",
      input,
    );
    const created = await createCallerInst.record.create(input);
    expect(created.recordId).toBe(input.recordId);
    expect(created.version).toBe(1);

    const getCallerInst = await authedCallerFor(
      sessionId,
      authKey,
      "query",
      "record.getById",
      input.recordId,
    );
    const got = await getCallerInst.record.getById(input.recordId);
    expect(got.recordId).toBe(input.recordId);
    expect(got.encryptedData).toBe(input.encryptedData);
  });

  it("update increments version and getById returns the latest", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const input = newRecordInput();
    let cc = await authedCallerFor(sessionId, authKey, "mutation", "record.create", input);
    await cc.record.create(input);

    const update = {
      recordId: input.recordId,
      encryptedData: "ENC-V2",
      encryptionNonce: "NONCE-V2",
      cryptoVersion: 1,
      version: 1,
      clientUpdatedAt: new Date().toISOString(),
    };
    cc = await authedCallerFor(sessionId, authKey, "mutation", "record.update", update);
    const updated = await cc.record.update(update);
    expect(updated.version).toBe(2);

    cc = await authedCallerFor(sessionId, authKey, "query", "record.getById", input.recordId);
    const got = await cc.record.getById(input.recordId);
    expect(got.version).toBe(2);
    expect(got.encryptedData).toBe("ENC-V2");
  });

  it("delete soft-deletes and excludes from `all`", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const input = newRecordInput();
    let cc = await authedCallerFor(sessionId, authKey, "mutation", "record.create", input);
    await cc.record.create(input);

    cc = await authedCallerFor(sessionId, authKey, "mutation", "record.delete", input.recordId);
    await cc.record.delete(input.recordId);

    cc = await authedCallerFor(sessionId, authKey, "query", "record.all", undefined);
    const { records } = await cc.record.all();
    expect(records.find((r) => r.recordId === input.recordId)).toBeUndefined();
  });

  it("history returns every version of the record", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const input = newRecordInput();
    let cc = await authedCallerFor(sessionId, authKey, "mutation", "record.create", input);
    await cc.record.create(input);

    const update = {
      recordId: input.recordId,
      encryptedData: "ENC-V2",
      encryptionNonce: "NONCE-V2",
      cryptoVersion: 1,
      version: 1,
      clientUpdatedAt: new Date().toISOString(),
    };
    cc = await authedCallerFor(sessionId, authKey, "mutation", "record.update", update);
    await cc.record.update(update);

    cc = await authedCallerFor(sessionId, authKey, "query", "record.history", input.recordId);
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
    const aCreate = await authedCallerFor(
      a.sessionId,
      a.authKey,
      "mutation",
      "record.create",
      input,
    );
    await aCreate.record.create(input);

    // B asks for the record by id → NOT_FOUND
    const bGet = await authedCallerFor(
      b.sessionId,
      b.authKey,
      "query",
      "record.getById",
      input.recordId,
    );
    await expect(bGet.record.getById(input.recordId)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // B's `all` does not include it
    const bAll = await authedCallerFor(b.sessionId, b.authKey, "query", "record.all", undefined);
    const { records } = await bAll.record.all();
    expect(records.find((r) => r.recordId === input.recordId)).toBeUndefined();
  });
});
