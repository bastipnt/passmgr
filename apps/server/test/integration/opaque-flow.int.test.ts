import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as opaque from "@serenity-kit/opaque";
import { db, usersTable } from "@repo/db";
import {
  decryptXChaCha,
  encryptXChaCha,
  genKey,
  genPasswordKek,
  genSalt,
  hkdf,
  retrievePRK,
} from "@repo/crypto";
import { fromBase64, toBase64, UUIDV4_RE } from "@repo/util";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { createCaller, loginAndGetAuthKey } from "./_helpers";
import { buildTestContext } from "../setup/test-context";

/**
 * Register a user the same way the client does, but keep `vaultKey` + `recoveryKey`
 * in scope so the test can re-derive both KEKs and verify dual-path decryption.
 */
async function registerCapturingVaultKey(email: string, password: string) {
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

  const recoveryKey = genKey();
  const recoveryKekSaltData = genSalt();
  const { passwordKek, passwordKekParams, passwordKekSaltData } = await genPasswordKek(password);
  const recoveryKek = await hkdf(recoveryKey, "recoveryRootKey", recoveryKekSaltData);
  const vaultKey = genKey();
  const [encryptedVaultKey, vaultKeyEncryptionNonce] = encryptXChaCha(passwordKek, vaultKey);
  const [encryptedVaultKeyRecovery, vaultKeyEncryptionNonceRecovery] = encryptXChaCha(
    recoveryKek,
    vaultKey,
  );

  await caller.register.finishRegistration({
    email,
    registrationRecord,
    userKeys: {
      recoveryKekSalt: toBase64(recoveryKekSaltData),
      passwordKekParams,
      passwordKekSalt: toBase64(passwordKekSaltData),
      encryptedVaultKey,
      vaultKeyEncryptionNonce,
      encryptedVaultKeyRecovery,
      vaultKeyEncryptionNonceRecovery,
    },
  });

  return { vaultKey, recoveryKey };
}

beforeAll(async () => {
  await opaque.ready;
});

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("opaque-flow — register + login round-trip (real crypto, real containers)", () => {
  const email = "alice@example.com";
  const password = "correct horse battery staple";

  it("vaultKey decrypts identically via passwordKek (real Argon2id) and recoveryKek paths", async () => {
    const { vaultKey, recoveryKey } = await registerCapturingVaultKey(email, password);

    const [user] = await db.select().from(usersTable);
    const stored = await db.query.keysTable.findFirst({ where: { userId: user!.userId } });
    expect(stored).toBeDefined();

    const passwordKek = await retrievePRK(
      password,
      fromBase64(stored!.passwordKekSalt),
      stored!.passwordKekParams,
    );
    const decryptedViaPassword = decryptXChaCha(
      passwordKek,
      stored!.encryptedVaultKey,
      stored!.vaultKeyEncryptionNonce,
    );

    const recoveryKek = await hkdf(
      recoveryKey,
      "recoveryRootKey",
      fromBase64(stored!.recoveryKekSalt),
    );
    const decryptedViaRecovery = decryptXChaCha(
      recoveryKek,
      stored!.encryptedVaultKeyRecovery,
      stored!.vaultKeyEncryptionNonceRecovery,
    );

    expect(Array.from(decryptedViaPassword)).toEqual(Array.from(vaultKey));
    expect(Array.from(decryptedViaRecovery)).toEqual(Array.from(vaultKey));
  });

  it("wrong password yields a different passwordKek that fails AEAD verification", async () => {
    await registerCapturingVaultKey(email, password);

    const [user] = await db.select().from(usersTable);
    const stored = await db.query.keysTable.findFirst({ where: { userId: user!.userId } });

    const wrongKek = await retrievePRK(
      "WRONG-PASSWORD",
      fromBase64(stored!.passwordKekSalt),
      stored!.passwordKekParams,
    );
    expect(() =>
      decryptXChaCha(wrongKek, stored!.encryptedVaultKey, stored!.vaultKeyEncryptionNonce),
    ).toThrow();
  });

  it("login after register produces a working authKey + real-Redis session", async () => {
    await registerCapturingVaultKey(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    expect(sessionId).toMatch(UUIDV4_RE);
    expect(authKey).toHaveLength(32);

    const sessionRaw = await redis.get(`session:${sessionId}`);
    expect(sessionRaw).toBeTruthy();
    const ttl = await redis.ttl(`session:${sessionId}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60);
  });
});
