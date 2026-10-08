import { retrievePRK, unwrapAccountKey, unwrapVaultKey } from "@repo/crypto";
import { db, keysTable, usersTable, vaultMembersTable } from "@repo/db";
import { fromBase64 } from "@repo/util";
import { and, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeAccountPassword,
  PasswordChangeFailedError,
  type PasswordChangeTRPCClient,
  WrongPasswordError,
} from "../../../../packages/client/src/account/change-password";
import type { LoginSessionFn } from "../../../../packages/client/src/login";
import { secretsStore } from "../../../../packages/store/src/secrets-store";
import { FRESH_AUTH_WINDOW_MS } from "../../src/auth/auth-middleware";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { clientStartRegistration } from "../setup/opaque-client";
import { deriveAuthKey } from "../setup/signed-request";
import { buildTestContext } from "../setup/test-context";
import { buildUserKeys } from "../setup/user-keys";
import { callSigned, createCaller, loginAndGetAuthKey, register } from "./_helpers";

// The real Argon2 derivation, in-process (no workers in node).
vi.mock("@repo/crypto/services/argon2-worker-service", async () => {
  const { retrievePRK: derive } = await import("@repo/crypto");
  return { argon2WorkerService: { derive } };
});

const email = "alice@example.com";
const password = "correct horse battery staple";
const newPassword = "a brand new master password";

type CapturedCall = { path: string; input: unknown };

/**
 * Shim with the shape `changeAccountPassword` uses: the login goes to the
 * public procedures, `user.*` is signed with the session `attach` received.
 */
function passwordChangeClient(captured: CapturedCall[] = []) {
  const caller = createCaller(buildTestContext(undefined));
  let session: { sessionId: string; authKey: Uint8Array } | undefined;

  const attach: LoginSessionFn = async (sessionId, sessionKey, authSalt) => {
    session = { sessionId, authKey: await deriveAuthKey(sessionKey, authSalt) };
  };

  function signed<P extends "startPasswordChange" | "finishPasswordChange">(procedure: P) {
    return {
      mutate: async (input: Record<string, unknown>) => {
        const path = `user.${procedure}`;
        captured.push({ path, input });
        if (!session) throw new Error("no session attached");
        const signedCaller = await callSigned(
          session.sessionId,
          session.authKey,
          "mutation",
          path,
          input,
        );
        const forward = signedCaller.user[procedure] as (input: unknown) => Promise<unknown>;
        return await forward(input);
      },
    };
  }

  const trpc = {
    login: {
      startLogin: {
        mutate: async (input: Parameters<typeof caller.login.startLogin>[0]) => {
          captured.push({ path: "login.startLogin", input });
          return await caller.login.startLogin(input);
        },
      },
      finishLogin: {
        mutate: async (input: Parameters<typeof caller.login.finishLogin>[0]) => {
          captured.push({ path: "login.finishLogin", input });
          return await caller.login.finishLogin(input);
        },
      },
    },
    user: {
      startPasswordChange: signed("startPasswordChange"),
      finishPasswordChange: signed("finishPasswordChange"),
    },
  };
  return {
    trpc: trpc as unknown as PasswordChangeTRPCClient,
    attach,
    session: () => session,
  };
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

/** Register Alice and unlock her account key in memory, as an unlocked vault would. */
async function registerAndUnlock() {
  const { accountKey } = await register(email, password);
  secretsStore.unlockWithAccountKey(accountKey.slice());
  const [user] = await db.select({ userId: usersTable.userId }).from(usersTable);
  if (!user) throw new Error("no user");
  const keys = await activeKeySet();
  const { userKeyPair } = await loginAndGetAuthKey(email, password);
  const material = {
    passwordKekParams: keys.passwordKekParams,
    passwordKekSalt: keys.passwordKekSalt,
    encryptedAccountKey: keys.encryptedAccountKey,
    accountKeyEncryptionNonce: keys.accountKeyEncryptionNonce,
    userKeyPair,
  };
  return { accountKey, account: { email, userId: user.userId }, material };
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

afterEach(() => secretsStore.lock());

describe("password change (real Postgres + Redis)", () => {
  it("rewraps the same account key, swaps the OPAQUE record and revokes every session", async () => {
    const { accountKey, account, material } = await registerAndUnlock();
    const oldSession = await loginAndGetAuthKey(email, password);
    const before = await activeKeySet();
    const [personalVault] = await db.select().from(vaultMembersTable);
    if (!personalVault) throw new Error("no personal vault");
    const { trpc, attach, session } = passwordChangeClient();

    const changed = await changeAccountPassword(
      trpc,
      attach,
      account,
      material,
      password,
      newPassword,
    );

    // The server's new wrap is the one returned, and opens the same account key.
    const after = await activeKeySet();
    expect(after).toMatchObject({
      encryptedAccountKey: changed.encryptedAccountKey,
      passwordKekSalt: changed.passwordKekSalt,
    });
    expect(changed.userKeyPair).toEqual(material.userKeyPair);
    expect(await accountKeyViaPassword(newPassword)).toEqual(accountKey);
    // Recovery wrap and vault keys untouched: the recovery key and records still work.
    expect(after).toMatchObject({
      recoveryKekSalt: before.recoveryKekSalt,
      encryptedAccountKeyRecovery: before.encryptedAccountKeyRecovery,
      recoveryVerifier: before.recoveryVerifier,
    });
    expect(await db.select().from(vaultMembersTable)).toEqual([personalVault]);
    expect(unwrapVaultKey(accountKey, personalVault)).toHaveLength(32);

    // Old key set closed, not overwritten.
    const rows = await db.select().from(keysTable);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.valid_to === null)).toHaveLength(1);

    // OPAQUE record replaced: old password fails, new one works.
    await expect(loginAndGetAuthKey(email, password)).rejects.toThrow();
    await expect(loginAndGetAuthKey(email, newPassword)).resolves.toBeDefined();

    // Every session from before is dead, the fresh one used for the change too.
    for (const s of [oldSession, session()!]) {
      const cc = await callSigned(s.sessionId, s.authKey, "query", "user.heartbeat", undefined);
      await expect(cc.user.heartbeat()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("refuses a wrong current password without touching the account", async () => {
    const { account, material } = await registerAndUnlock();
    const { trpc, attach, session } = passwordChangeClient();

    await expect(
      changeAccountPassword(trpc, attach, account, material, "not my password", newPassword),
    ).rejects.toBeInstanceOf(WrongPasswordError);

    expect(session()).toBeUndefined();
    expect(await db.select().from(keysTable)).toHaveLength(1);
    await expect(loginAndGetAuthKey(email, password)).resolves.toBeDefined();
  });

  it("refuses when the email's account isn't this vault's", async () => {
    const { account, material } = await registerAndUnlock();
    const { trpc, attach, session } = passwordChangeClient();

    await expect(
      changeAccountPassword(
        trpc,
        attach,
        { ...account, userId: crypto.randomUUID() },
        material,
        password,
        newPassword,
      ),
    ).rejects.toBeInstanceOf(PasswordChangeFailedError);
    expect(session()).toBeUndefined();
    expect(await db.select().from(keysTable)).toHaveLength(1);
  });

  it("never sends either password to the server", async () => {
    const { account, material } = await registerAndUnlock();
    const captured: CapturedCall[] = [];
    const { trpc, attach } = passwordChangeClient(captured);

    await changeAccountPassword(trpc, attach, account, material, password, newPassword);

    expect(captured.map((c) => c.path)).toEqual([
      "login.startLogin",
      "login.finishLogin",
      "user.startPasswordChange",
      "user.finishPasswordChange",
    ]);
    for (const call of captured) {
      const serialized = JSON.stringify(call.input);
      expect(serialized.includes(password), `password leaked in ${call.path}`).toBe(false);
      expect(serialized.includes(newPassword), `new password leaked in ${call.path}`).toBe(false);
    }
  });

  it("requires a fresh login", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);
    const key = `session:${sessionId}`;
    const stored = JSON.parse((await redis.get(key)) ?? "{}");
    stored.authenticatedAt = Date.now() - FRESH_AUTH_WINDOW_MS - 1_000;
    await redis.set(key, JSON.stringify(stored), "KEEPTTL");

    const { registrationRequest } = await clientStartRegistration(newPassword);
    const input = { email, registrationRequest };
    const cc = await callSigned(sessionId, authKey, "mutation", "user.startPasswordChange", input);
    await expect(cc.user.startPasswordChange(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses another user's email as the OPAQUE identifier", async () => {
    await register(email, password);
    await register("bob@example.com", password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const { registrationRequest } = await clientStartRegistration(newPassword);
    const input = { email: "bob@example.com", registrationRequest };
    const cc = await callSigned(sessionId, authKey, "mutation", "user.startPasswordChange", input);
    await expect(cc.user.startPasswordChange(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses to finish when the key set changed since the start", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);
    const started = await clientStartRegistration(newPassword);
    const startInput = { email, registrationRequest: started.registrationRequest };
    const startCaller = await callSigned(
      sessionId,
      authKey,
      "mutation",
      "user.startPasswordChange",
      startInput,
    );
    const { attemptId, registrationResponse } =
      await startCaller.user.startPasswordChange(startInput);
    const { registrationRecord } = await started.finish(registrationResponse, email);

    // A concurrent rekey closes the key set the attempt was bound to.
    const { passwordKekParams, passwordKekSalt, encryptedAccountKey, accountKeyEncryptionNonce } =
      await buildUserKeys(password);
    const passwordKeys = {
      passwordKekParams,
      passwordKekSalt,
      encryptedAccountKey,
      accountKeyEncryptionNonce,
    };
    const rekeyCaller = await callSigned(
      sessionId,
      authKey,
      "mutation",
      "user.rekeyPasswordKeys",
      passwordKeys,
    );
    await rekeyCaller.user.rekeyPasswordKeys(passwordKeys);

    const finishInput = { attemptId, registrationRecord, passwordKeys };
    const finishCaller = await callSigned(
      sessionId,
      authKey,
      "mutation",
      "user.finishPasswordChange",
      finishInput,
    );
    await expect(finishCaller.user.finishPasswordChange(finishInput)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // The OPAQUE record stayed: the old password still logs in.
    await expect(loginAndGetAuthKey(email, password)).resolves.toBeDefined();
  });
});
