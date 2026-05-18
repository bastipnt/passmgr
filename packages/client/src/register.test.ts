import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Redis so importing appRouter doesn't spawn a real connection attempt.
const { redisMock } = vi.hoisted(() => {
  const IoRedisMock = require("ioredis-mock") as typeof import("ioredis-mock");
  return { redisMock: new IoRedisMock() };
});
vi.mock("server/src/redis", () => ({ redis: redisMock }));

vi.mock("@repo/crypto", () =>
  import("server/test/setup/crypto-mock").then((m) => m.cryptoMockFactory()),
);

import * as opaque from "@serenity-kit/opaque";
import { wipe } from "@repo/crypto";
import { toBase64 } from "@repo/util";
import { db, usersTable } from "@repo/db";
import { createCallerFactory } from "server/src/trpc";
import { appRouter } from "server/src/router";
import { buildTestContext } from "server/test/setup/test-context";
import { truncateAll } from "server/test/setup/db-helpers";
import {
  RegistrationFinishFailedError,
  RegistrationStartFailedError,
  generateUserKeys,
  registerNewUser,
} from "./register";
import { callerToTrpc, withCapture, withThrow } from "../test/fixtures/trpc-from-caller";

const wipeMock = vi.mocked(wipe);

const createCaller = createCallerFactory(appRouter);

function buildRealTrpc() {
  return callerToTrpc(createCaller(buildTestContext(undefined)));
}

beforeAll(async () => {
  await opaque.ready;
});

beforeEach(async () => {
  await truncateAll();
  await redisMock.flushall();
  wipeMock.mockClear();
});

describe("registerNewUser — success path", () => {
  const email = "alice@example.com";
  const password = "correct horse battery staple";

  it("returns a 32-byte recoveryKey", async () => {
    const recoveryKey = await registerNewUser(buildRealTrpc(), email, password);
    expect(recoveryKey).toBeInstanceOf(Uint8Array);
    expect(recoveryKey.byteLength).toBe(32);
  });

  it("persists a users row to the database", async () => {
    await registerNewUser(buildRealTrpc(), email, password);
    const rows = await db.select().from(usersTable);
    expect(rows).toHaveLength(1);
  });

  it("never sends the recoveryKey in any tRPC payload", async () => {
    const { trpc, captured } = withCapture(buildRealTrpc());
    const recoveryKey = await registerNewUser(trpc, email, password);

    const recoveryKeyB64 = toBase64(recoveryKey);
    const fullCaptured = JSON.stringify({
      start: captured.register.startInputs,
      finish: captured.register.finishInputs,
    });

    expect(fullCaptured.includes(recoveryKeyB64)).toBe(false);
    const recoveryKeyHex = Array.from(recoveryKey)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(fullCaptured.toLowerCase().includes(recoveryKeyHex)).toBe(false);
  });

  it("never sends the plaintext password in any tRPC payload", async () => {
    const { trpc, captured } = withCapture(buildRealTrpc());
    await registerNewUser(trpc, email, password);
    const fullCaptured = JSON.stringify({
      start: captured.register.startInputs,
      finish: captured.register.finishInputs,
    });
    expect(fullCaptured.includes(password)).toBe(false);
  });

  it("encrypts the vault key twice with distinct nonces", async () => {
    const { trpc, captured } = withCapture(buildRealTrpc());
    await registerNewUser(trpc, email, password);

    const { userKeys } = captured.register.finishInputs[0]!;
    expect(userKeys.vaultKeyEncryptionNonce).not.toBe(userKeys.vaultKeyEncryptionNonceRecovery);
    expect(userKeys.encryptedVaultKey).not.toBe(userKeys.encryptedVaultKeyRecovery);
  });

  it("wipes the two salt buffers and the vaultKey buffer (3 wipes on success)", async () => {
    await registerNewUser(buildRealTrpc(), email, password);
    expect(wipeMock).toHaveBeenCalledTimes(3);
  });

  it("sends well-formed userKeys (Argon2 params + base64 lengths)", async () => {
    const { trpc, captured } = withCapture(buildRealTrpc());
    await registerNewUser(trpc, email, password);
    const { userKeys } = captured.register.finishInputs[0]!;

    expect(userKeys.passwordKekParams.t).toBe(3);
    expect(userKeys.passwordKekParams.p).toBe(1);
    expect(userKeys.passwordKekParams.m).toBe(128 * 1024);
    expect(userKeys.passwordKekSalt).toHaveLength(44);
    expect(userKeys.recoveryKekSalt).toHaveLength(44);
    expect(userKeys.encryptedVaultKey).toHaveLength(64);
    expect(userKeys.encryptedVaultKeyRecovery).toHaveLength(64);
    expect(userKeys.vaultKeyEncryptionNonce).toHaveLength(32);
    expect(userKeys.vaultKeyEncryptionNonceRecovery).toHaveLength(32);
  });
});

describe("registerNewUser — failure paths", () => {
  const email = "bob@example.com";
  const password = "another good password";

  it("throws RegistrationStartFailedError when startRegistration mutate fails", async () => {
    const trpc = withThrow(buildRealTrpc(), {
      path: "register.startRegistration",
      error: new Error("network"),
    });
    await expect(registerNewUser(trpc, email, password)).rejects.toBeInstanceOf(
      RegistrationStartFailedError,
    );
  });

  it("throws RegistrationFinishFailedError + wipes recoveryKey when finishRegistration mutate fails", async () => {
    const trpc = withThrow(buildRealTrpc(), {
      path: "register.finishRegistration",
      error: new Error("network"),
    });

    await expect(registerNewUser(trpc, email, password)).rejects.toBeInstanceOf(
      RegistrationFinishFailedError,
    );

    // On failure, wipe is called 4 times: 2 salts + vaultKey + recoveryKey
    expect(wipeMock).toHaveBeenCalledTimes(4);
    const lastWipe = wipeMock.mock.calls.at(-1)![0];
    expect(lastWipe).toBeInstanceOf(Uint8Array);
    expect(lastWipe.byteLength).toBe(32);
  });
});

describe("generateUserKeys", () => {
  it("produces a recoveryKey, salts, and double-encrypted vault key", async () => {
    const out = await generateUserKeys("p@ssw0rd!");
    expect(out.recoveryKey.byteLength).toBe(32);
    expect(out.encryptedVaultKey).not.toBe(out.encryptedVaultKeyRecovery);
    expect(out.vaultKeyEncryptionNonce).not.toBe(out.vaultKeyEncryptionNonceRecovery);
  });

  it("OPAQUE registration handshake completes against the real server router", async () => {
    await opaque.ready;
    const caller = createCaller(buildTestContext(undefined));
    const { clientRegistrationState, registrationRequest } = opaque.client.startRegistration({
      password: "pw",
    });
    const { registrationResponse } = await caller.register.startRegistration({
      email: "sanity@example.com",
      registrationRequest,
    });
    const { registrationRecord } = opaque.client.finishRegistration({
      clientRegistrationState,
      registrationResponse,
      password: "pw",
    });
    expect(typeof registrationRecord).toBe("string");
    expect(registrationRecord.length).toBeGreaterThan(0);
  });
});
