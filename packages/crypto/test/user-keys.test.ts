import { fromBase64 } from "@repo/util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptXChaCha } from "../src/encryption";
import {
  deriveRecoveryAuthKey,
  getPasswordKekParams,
  hashRecoveryAuthKey,
  retrievePRK,
  setPasswordKekParams,
} from "../src/hash";
import { generateUserKeys, unwrapVaultKeyWithRecoveryKey } from "../src/user-keys";
import { genKey } from "../src/util/secrets-utils";

const FAST_PARAMS = { t: 1, m: 8, p: 1 };
const PASSWORD = "correct horse battery staple";

describe("generateUserKeys", () => {
  const previous = getPasswordKekParams();
  beforeAll(() => setPasswordKekParams(FAST_PARAMS));
  afterAll(() => setPasswordKekParams(previous));

  async function unwrapWithPassword(keys: Awaited<ReturnType<typeof generateUserKeys>>) {
    const kek = await retrievePRK(
      PASSWORD,
      fromBase64(keys.passwordKekSalt),
      keys.passwordKekParams,
    );
    return decryptXChaCha(kek, keys.encryptedVaultKey, keys.vaultKeyEncryptionNonce);
  }

  it("wraps the same vault key under the password and the recovery key", async () => {
    const keys = await generateUserKeys(PASSWORD);
    const viaPassword = await unwrapWithPassword(keys);
    const viaRecovery = await unwrapVaultKeyWithRecoveryKey(keys.recoveryKey, keys);
    expect(viaPassword).toHaveLength(32);
    expect(viaRecovery).toEqual(viaPassword);
  });

  it("stores the hash of the recovery auth key as verifier", async () => {
    const keys = await generateUserKeys(PASSWORD);
    const authKey = await deriveRecoveryAuthKey(keys.recoveryKey);
    expect(fromBase64(keys.recoveryVerifier)).toEqual(await hashRecoveryAuthKey(authKey));
  });

  it("re-wraps a given vault key without wiping it", async () => {
    const vaultKey = genKey();
    const copy = vaultKey.slice();
    const keys = await generateUserKeys(PASSWORD, vaultKey);
    expect(vaultKey).toEqual(copy);
    expect(await unwrapWithPassword(keys)).toEqual(copy);
    expect(await unwrapVaultKeyWithRecoveryKey(keys.recoveryKey, keys)).toEqual(copy);
  });

  it("issues a fresh recovery key every time", async () => {
    const vaultKey = genKey();
    const a = await generateUserKeys(PASSWORD, vaultKey);
    const b = await generateUserKeys(PASSWORD, vaultKey);
    expect(a.recoveryKey).not.toEqual(b.recoveryKey);
    expect(a.recoveryVerifier).not.toEqual(b.recoveryVerifier);
  });
});

describe("unwrapVaultKeyWithRecoveryKey", () => {
  const previous = getPasswordKekParams();
  beforeAll(() => setPasswordKekParams(FAST_PARAMS));
  afterAll(() => setPasswordKekParams(previous));

  it("throws for a wrong recovery key", async () => {
    const keys = await generateUserKeys(PASSWORD);
    await expect(unwrapVaultKeyWithRecoveryKey(genKey(), keys)).rejects.toThrow();
  });
});
