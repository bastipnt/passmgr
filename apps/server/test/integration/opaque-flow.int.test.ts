import {
  decryptXChaChaWithAAD,
  deriveRecoveryAuthKey,
  encryptXChaChaWithAAD,
  genKey,
  genPasswordKek,
  genSalt,
  hashRecoveryAuthKey,
  hkdf,
  retrievePRK,
} from "@repo/crypto";
import { db, usersTable, vaultMembersTable, vaultsTable } from "@repo/db";
import { fromBase64, fromString, toBase64, UUIDV4_RE } from "@repo/util";
import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { clientStartRegistration } from "../setup/opaque-client";
import { buildTestContext } from "../setup/test-context";
import { createCaller, loginAndGetAuthKey } from "./_helpers";

// Spelled out here instead of imported, so a change to the wrap format in
// @repo/crypto shows up as a failure rather than passing silently.
const ACCOUNT_KEY_AAD = fromString("passmgr/account-key/v1");
const vaultKeyAad = (vaultId: string, keyVersion: number) =>
  fromString(`passmgr/vault-key/v1/${vaultId}/${keyVersion}`);

/**
 * Register a user the same way the client does, but keep the account key, the
 * personal vault key and the recovery key in scope, so the test can re-derive
 * every KEK and verify each unwrap path independently.
 */
async function registerCapturingKeys(email: string, password: string) {
  const caller = createCaller(buildTestContext(undefined));

  const started = await clientStartRegistration(password);
  const { registrationResponse } = await caller.register.startRegistration({
    email,
    registrationRequest: started.registrationRequest,
  });
  const { registrationRecord } = await started.finish(registrationResponse, email);

  const recoveryKey = genKey();
  const recoveryKekSaltData = genSalt();
  const { passwordKek, passwordKekParams, passwordKekSaltData } = await genPasswordKek(password);
  const recoveryKek = await hkdf(recoveryKey, "recoveryRootKey", recoveryKekSaltData);
  const accountKey = genKey();
  const [encryptedAccountKey, accountKeyEncryptionNonce] = encryptXChaChaWithAAD(
    passwordKek,
    accountKey,
    ACCOUNT_KEY_AAD,
  );
  const [encryptedAccountKeyRecovery, accountKeyEncryptionNonceRecovery] = encryptXChaChaWithAAD(
    recoveryKek,
    accountKey,
    ACCOUNT_KEY_AAD,
  );

  const vaultId = crypto.randomUUID();
  const vaultKey = genKey();
  const [encryptedVaultKey, vaultKeyEncryptionNonce] = encryptXChaChaWithAAD(
    accountKey,
    vaultKey,
    vaultKeyAad(vaultId, 1),
  );

  await caller.register.finishRegistration({
    email,
    registrationRecord,
    userKeys: {
      recoveryKekSalt: toBase64(recoveryKekSaltData),
      recoveryVerifier: toBase64(
        await hashRecoveryAuthKey(await deriveRecoveryAuthKey(recoveryKey)),
      ),
      passwordKekParams,
      passwordKekSalt: toBase64(passwordKekSaltData),
      encryptedAccountKey,
      accountKeyEncryptionNonce,
      encryptedAccountKeyRecovery,
      accountKeyEncryptionNonceRecovery,
    },
    personalVault: { vaultId, keyVersion: 1, encryptedVaultKey, vaultKeyEncryptionNonce },
  });

  return { accountKey, recoveryKey, vaultId, vaultKey };
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("opaque-flow — register + login round-trip (real crypto, real containers)", () => {
  const email = "alice@example.com";
  const password = "correct horse battery staple";

  it("accountKey decrypts identically via passwordKek (real Argon2id) and recoveryKek paths", async () => {
    const { accountKey, recoveryKey } = await registerCapturingKeys(email, password);

    const [user] = await db.select().from(usersTable);
    const stored = await db.query.keysTable.findFirst({ where: { userId: user!.userId } });
    expect(stored).toBeDefined();

    const passwordKek = await retrievePRK(
      password,
      fromBase64(stored!.passwordKekSalt),
      stored!.passwordKekParams,
    );
    const decryptedViaPassword = decryptXChaChaWithAAD(
      passwordKek,
      stored!.encryptedAccountKey,
      stored!.accountKeyEncryptionNonce,
      ACCOUNT_KEY_AAD,
    );

    const recoveryKek = await hkdf(
      recoveryKey,
      "recoveryRootKey",
      fromBase64(stored!.recoveryKekSalt),
    );
    const decryptedViaRecovery = decryptXChaChaWithAAD(
      recoveryKek,
      stored!.encryptedAccountKeyRecovery,
      stored!.accountKeyEncryptionNonceRecovery,
      ACCOUNT_KEY_AAD,
    );

    expect(Array.from(decryptedViaPassword)).toEqual(Array.from(accountKey));
    expect(Array.from(decryptedViaRecovery)).toEqual(Array.from(accountKey));

    // The two stored account-key wraps must use distinct nonces — the same key
    // encrypted twice with different KEKs must never reuse a nonce.
    expect(stored!.accountKeyEncryptionNonce).not.toBe(stored!.accountKeyEncryptionNonceRecovery);
  });

  it("wrong password yields a different passwordKek that fails AEAD verification", async () => {
    await registerCapturingKeys(email, password);

    const [user] = await db.select().from(usersTable);
    const stored = await db.query.keysTable.findFirst({ where: { userId: user!.userId } });

    const wrongKek = await retrievePRK(
      "WRONG-PASSWORD",
      fromBase64(stored!.passwordKekSalt),
      stored!.passwordKekParams,
    );
    expect(() =>
      decryptXChaChaWithAAD(
        wrongKek,
        stored!.encryptedAccountKey,
        stored!.accountKeyEncryptionNonce,
        ACCOUNT_KEY_AAD,
      ),
    ).toThrow();
  });

  it("registration creates the personal vault, and login hands back its key", async () => {
    const { accountKey, vaultId, vaultKey } = await registerCapturingKeys(email, password);

    const [user] = await db.select().from(usersTable);
    expect(await db.select().from(vaultsTable)).toEqual([
      expect.objectContaining({ vaultId, ownerId: user!.userId, kind: "personal", keyVersion: 1 }),
    ]);
    expect(await db.select().from(vaultMembersTable)).toEqual([
      expect.objectContaining({ vaultId, userId: user!.userId, role: "owner", keyVersion: 1 }),
    ]);

    const { vaultKeys } = await loginAndGetAuthKey(email, password);

    expect(vaultKeys).toEqual([
      expect.objectContaining({ vaultId, keyVersion: 1, kind: "personal" }),
    ]);
    const [wrap] = vaultKeys;
    expect(
      decryptXChaChaWithAAD(
        accountKey,
        wrap!.encryptedVaultKey,
        wrap!.vaultKeyEncryptionNonce,
        vaultKeyAad(vaultId, 1),
      ),
    ).toEqual(vaultKey);
  });

  it("login after register produces a working authKey + real-Redis session", async () => {
    await registerCapturingKeys(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    expect(sessionId).toMatch(UUIDV4_RE);
    expect(authKey).toHaveLength(32);

    const sessionRaw = await redis.get(`session:${sessionId}`);
    expect(sessionRaw).toBeTruthy();
    const ttl = await redis.ttl(`session:${sessionId}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it("login succeeds when the email differs only in case / whitespace from registration", async () => {
    await registerCapturingKeys("Mixed.Case@Example.COM", password);
    const { sessionId } = await loginAndGetAuthKey("  mixed.case@example.com ", password);
    expect(sessionId).toMatch(UUIDV4_RE);
  });
});
