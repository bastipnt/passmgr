import {
  deriveRecoveryAuthKey,
  genKey,
  retrievePRK,
  unwrapAccountKey,
  unwrapVaultKey,
} from "@repo/crypto";
import { db, keysTable, vaultMembersTable } from "@repo/db";
import { fromBase64, toBase64 } from "@repo/util";
import { and, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  RecoveryFailedError,
  RecoveryKeyInvalidError,
  type RecoveryTRPCClient,
  recoverAccount,
} from "../../../../packages/client/src/recover";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { clientStartRegistration } from "../setup/opaque-client";
import { buildTestContext } from "../setup/test-context";
import { buildUserKeys } from "../setup/user-keys";
import { callSigned, createCaller, loginAndGetAuthKey, register } from "./_helpers";

const email = "alice@example.com";
const password = "correct horse battery staple";
const newPassword = "a brand new master password";

type CapturedCall = { path: string; input: unknown };

/**
 * Shim with the shape `recoverAccount` uses, forwarding to the in-process
 * server caller and recording every input that crosses the boundary.
 */
function recoveryClient(captured: CapturedCall[] = []): RecoveryTRPCClient {
  const caller = createCaller(buildTestContext(undefined));
  const trpc = {
    recovery: {
      startRecovery: {
        mutate: async (input: Parameters<typeof caller.recovery.startRecovery>[0]) => {
          captured.push({ path: "recovery.startRecovery", input });
          return await caller.recovery.startRecovery(input);
        },
      },
      finishRecovery: {
        mutate: async (input: Parameters<typeof caller.recovery.finishRecovery>[0]) => {
          captured.push({ path: "recovery.finishRecovery", input });
          return await caller.recovery.finishRecovery(input);
        },
      },
    },
  };
  return trpc as unknown as RecoveryTRPCClient;
}

async function activeKeySet() {
  const [active] = await db
    .select()
    .from(keysTable)
    .where(and(isNull(keysTable.valid_to), isNull(keysTable.deleted_at)));
  if (!active) throw new Error("no active key set");
  return active;
}

/** Unwrap the account key from the active key set with a master password. */
async function accountKeyViaPassword(pw: string): Promise<Uint8Array> {
  const keys = await activeKeySet();
  const kek = await retrievePRK(pw, fromBase64(keys.passwordKekSalt), keys.passwordKekParams);
  return unwrapAccountKey(kek, keys.encryptedAccountKey, keys.accountKeyEncryptionNonce);
}

/** Drive startRecovery by hand (for tests that need to interleave other calls). */
async function startRecoveryManually(recoveryKey: Uint8Array) {
  const caller = createCaller(buildTestContext(undefined));
  const started = await clientStartRegistration(newPassword);
  const { attemptId, registrationResponse } = await caller.recovery.startRecovery({
    email,
    recoveryAuthKey: toBase64(await deriveRecoveryAuthKey(recoveryKey)),
    registrationRequest: started.registrationRequest,
  });
  const { registrationRecord } = await started.finish(registrationResponse, email);
  const { recoveryKey: _new, ...userKeys } = await buildUserKeys(newPassword);
  return { caller, finishInput: { email, attemptId, registrationRecord, userKeys } };
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("account recovery (real Postgres + Redis)", () => {
  it("resets the password, keeps the account and vault keys and revokes existing sessions", async () => {
    const { recoveryKey } = await register(email, password);
    const oldSession = await loginAndGetAuthKey(email, password);
    const accountKeyBefore = await accountKeyViaPassword(password);
    const [personalVault] = await db.select().from(vaultMembersTable);
    if (!personalVault) throw new Error("no personal vault");

    const newRecoveryKey = await recoverAccount(
      recoveryClient(),
      email,
      toBase64(recoveryKey),
      newPassword,
    );
    expect(newRecoveryKey).toHaveLength(32);

    // Same account key under the new password, and the vault key wraps are
    // untouched — existing records stay readable.
    const accountKeyAfter = await accountKeyViaPassword(newPassword);
    expect(accountKeyAfter).toEqual(accountKeyBefore);
    expect(await db.select().from(vaultMembersTable)).toEqual([personalVault]);
    expect(unwrapVaultKey(accountKeyAfter, personalVault)).toHaveLength(32);

    // OPAQUE record replaced: old password fails, new one works.
    await expect(loginAndGetAuthKey(email, password)).rejects.toThrow();
    await expect(loginAndGetAuthKey(email, newPassword)).resolves.toBeDefined();

    // Sessions from before the recovery are dead.
    const cc = await callSigned(
      oldSession.sessionId,
      oldSession.authKey,
      "query",
      "user.heartbeat",
      undefined,
    );
    await expect(cc.user.heartbeat()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    // Old key set closed, not overwritten.
    const rows = await db.select().from(keysTable);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.valid_to === null)).toHaveLength(1);
  });

  it("rotates the recovery key: the old one stops working, the new one works", async () => {
    const { recoveryKey } = await register(email, password);
    const trpc = recoveryClient();

    const rotated = await recoverAccount(trpc, email, toBase64(recoveryKey), newPassword);

    await expect(
      recoverAccount(trpc, email, toBase64(recoveryKey), "yet another password"),
    ).rejects.toBeInstanceOf(RecoveryFailedError);
    await expect(
      recoverAccount(trpc, email, toBase64(rotated), "yet another password"),
    ).resolves.toHaveLength(32);
  });

  it("never sends the recovery keys or the new password to the server", async () => {
    const { recoveryKey } = await register(email, password);
    const captured: CapturedCall[] = [];

    const rotated = await recoverAccount(
      recoveryClient(captured),
      email,
      toBase64(recoveryKey),
      newPassword,
    );

    expect(captured.map((c) => c.path)).toEqual([
      "recovery.startRecovery",
      "recovery.finishRecovery",
    ]);
    const secrets = {
      newPassword,
      recoveryKeyB64: toBase64(recoveryKey),
      recoveryKeyHex: Buffer.from(recoveryKey).toString("hex"),
      rotatedB64: toBase64(rotated),
      rotatedHex: Buffer.from(rotated).toString("hex"),
    };
    for (const call of captured) {
      const serialized = JSON.stringify(call.input);
      for (const [name, value] of Object.entries(secrets)) {
        expect(serialized.includes(value), `${name} leaked in ${call.path}`).toBe(false);
      }
    }
  });

  it("gives the same error for a wrong key, an unknown email and a missing verifier", async () => {
    await register(email, password);
    const caller = createCaller(buildTestContext(undefined));
    const { registrationRequest } = await clientStartRegistration(newPassword);
    const probe = (probeEmail: string) =>
      caller.recovery.startRecovery({
        email: probeEmail,
        recoveryAuthKey: toBase64(genKey()),
        registrationRequest,
      });
    const denied = { code: "UNAUTHORIZED", message: "recovery failed" };

    await expect(probe(email)).rejects.toMatchObject(denied);
    await expect(probe("nobody@example.com")).rejects.toMatchObject(denied);

    // Accounts registered before recovery existed have no verifier.
    await db.update(keysTable).set({ recoveryVerifier: null });
    await expect(probe(email)).rejects.toMatchObject(denied);
  });

  it("rejects a malformed recovery key before contacting the server", async () => {
    await register(email, password);
    const captured: CapturedCall[] = [];
    const trpc = recoveryClient(captured);

    for (const bad of ["not base64 !!", toBase64(genKey()).slice(0, 20)]) {
      await expect(recoverAccount(trpc, email, bad, newPassword)).rejects.toBeInstanceOf(
        RecoveryKeyInvalidError,
      );
    }
    expect(captured).toHaveLength(0);
  });

  it("accepts a recovery key pasted with whitespace", async () => {
    const { recoveryKey } = await register(email, password);
    const spaced = toBase64(recoveryKey).replace(/(.{11})/g, "$1 \n");

    await expect(
      recoverAccount(recoveryClient(), email, spaced, newPassword),
    ).resolves.toHaveLength(32);
  });

  it("recovery attempts are single-use", async () => {
    const { recoveryKey } = await register(email, password);
    const { caller, finishInput } = await startRecoveryManually(recoveryKey);

    await caller.recovery.finishRecovery(finishInput);
    await expect(caller.recovery.finishRecovery(finishInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects finishing an attempt under a different email", async () => {
    const { recoveryKey } = await register(email, password);
    await register("bob@example.com", password);
    const { caller, finishInput } = await startRecoveryManually(recoveryKey);

    await expect(
      caller.recovery.finishRecovery({ ...finishInput, email: "bob@example.com" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(loginAndGetAuthKey(email, password)).resolves.toBeDefined();
    await expect(loginAndGetAuthKey("bob@example.com", password)).resolves.toBeDefined();
  });

  it("refuses to finish when the key set changed after startRecovery", async () => {
    const { recoveryKey } = await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);
    const { caller, finishInput } = await startRecoveryManually(recoveryKey);

    // Concurrent Argon2 rekey from a logged-in device closes the key set.
    const { passwordKekParams, passwordKekSalt, encryptedAccountKey, accountKeyEncryptionNonce } =
      await buildUserKeys(password);
    const rekeyInput = {
      passwordKekParams,
      passwordKekSalt,
      encryptedAccountKey,
      accountKeyEncryptionNonce,
    };
    const cc = await callSigned(
      sessionId,
      authKey,
      "mutation",
      "user.rekeyPasswordKeys",
      rekeyInput,
    );
    await cc.user.rekeyPasswordKeys(rekeyInput);

    await expect(caller.recovery.finishRecovery(finishInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    // Nothing swapped: the old password still logs in.
    await expect(loginAndGetAuthKey(email, password)).resolves.toBeDefined();
    expect(await db.select().from(keysTable)).toHaveLength(2);
  });
});
