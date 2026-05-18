import { encryptXChaCha, genKey, genPasswordKek, genSalt, hkdf } from "@repo/crypto";
import { toBase64 } from "@repo/util";
import type { UserKeySchema } from "@repo/schema";

/**
 * Test-only mirror of the client's `generateUserKeys` — produces a userKeys payload
 * shaped exactly like what `register.finishRegistration` accepts. Kept here (rather
 * than imported from @repo/client) so server tests do not need a React-only dependency.
 * TODO: maybe functionality can be moved to crypto
 */
export async function buildUserKeys(
  password: string,
): Promise<UserKeySchema & { recoveryKey: Uint8Array }> {
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
  return {
    recoveryKey,
    recoveryKekSalt: toBase64(recoveryKekSaltData),
    passwordKekParams,
    passwordKekSalt: toBase64(passwordKekSaltData),
    encryptedVaultKey,
    vaultKeyEncryptionNonce,
    encryptedVaultKeyRecovery,
    vaultKeyEncryptionNonceRecovery,
  };
}
