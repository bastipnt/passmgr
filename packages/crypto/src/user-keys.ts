import type { RecoveryWrapSchema, UserKeySchema } from "@repo/schema";
import { fromBase64, toBase64 } from "@repo/util";
import { decryptXChaCha, encryptXChaCha } from "./encryption";
import { deriveRecoveryAuthKey, genPasswordKek, hashRecoveryAuthKey, hkdf } from "./hash";
import { genKey, genSalt, wipe } from "./util/secrets-utils";

/**
 * Build a complete key set for an account: the vault key wrapped once under
 * the Argon2id password KEK and once under a fresh recovery key, plus the
 * server-side recovery verifier.
 *
 * @param password master password
 * @param vaultKey existing vault key to re-wrap (recovery); a new one is
 *   generated when omitted (registration). A passed-in key is not wiped.
 *
 * @returns the key set for the server and the new recoveryKey (show to the
 *   user once, never send to the server; the caller wipes it)
 */
export async function generateUserKeys(
  password: string,
  vaultKey?: Uint8Array,
): Promise<UserKeySchema & { recoveryKey: Uint8Array }> {
  const recoveryKey = genKey();
  const recoveryKekSaltData = genSalt();
  const key = vaultKey ?? genKey();

  const { passwordKek, passwordKekParams, passwordKekSaltData } = await genPasswordKek(password);
  const recoveryKek = await hkdf(recoveryKey, "recoveryRootKey", recoveryKekSaltData);
  const recoveryAuthKey = await deriveRecoveryAuthKey(recoveryKey);
  const recoveryVerifier = toBase64(await hashRecoveryAuthKey(recoveryAuthKey));

  const [encryptedVaultKey, vaultKeyEncryptionNonce] = encryptXChaCha(passwordKek, key);
  const [encryptedVaultKeyRecovery, vaultKeyEncryptionNonceRecovery] = encryptXChaCha(
    recoveryKek,
    key,
  );

  const recoveryKekSalt = toBase64(recoveryKekSaltData);
  const passwordKekSalt = toBase64(passwordKekSaltData);

  for (const buf of [recoveryKekSaltData, passwordKekSaltData, passwordKek, recoveryKek]) {
    wipe(buf);
  }
  wipe(recoveryAuthKey);
  if (!vaultKey) wipe(key);

  return {
    // only show to user, never sent to backend
    recoveryKey,

    recoveryKekSalt,
    recoveryVerifier,

    passwordKekParams,
    passwordKekSalt,

    encryptedVaultKey,
    vaultKeyEncryptionNonce,

    encryptedVaultKeyRecovery,
    vaultKeyEncryptionNonceRecovery,
  };
}

/**
 * Decrypt the recovery copy of the vault key. Throws when the recovery key
 * doesn't match the wrap (AEAD tag failure).
 */
export async function unwrapVaultKeyWithRecoveryKey(
  recoveryKey: Uint8Array,
  wrap: RecoveryWrapSchema,
): Promise<Uint8Array> {
  const recoveryKek = await hkdf(recoveryKey, "recoveryRootKey", fromBase64(wrap.recoveryKekSalt));
  try {
    return decryptXChaCha(
      recoveryKek,
      wrap.encryptedVaultKeyRecovery,
      wrap.vaultKeyEncryptionNonceRecovery,
    );
  } finally {
    wipe(recoveryKek);
  }
}
