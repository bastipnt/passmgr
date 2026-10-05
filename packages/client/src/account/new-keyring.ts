import { createUserKeyPair, createVault, generateUserKeys, genKey, wipe } from "@repo/crypto";

/** The default vault's metadata; the user can rename it later. */
const PERSONAL_VAULT_META = { name: "Personal" };

/**
 * A complete new keyring (ADR 0001 D3): a fresh account key wrapped under the
 * password and a fresh recovery key, the personal vault and the X25519 keypair,
 * both wrapped under the account key. Shared by registration and local vault
 * creation, so a local vault can later be linked to an account as it is.
 *
 * The caller owns (and wipes) `accountKey` and `recoveryKey`; the recovery key
 * is shown to the user once and never sent anywhere.
 */
export async function generateKeyring(password: string) {
  const accountKey = genKey();
  let recoveryKey: Uint8Array | undefined;
  try {
    const { recoveryKey: newRecoveryKey, ...userKeys } = await generateUserKeys(
      password,
      accountKey,
    );
    recoveryKey = newRecoveryKey;
    return {
      accountKey,
      recoveryKey,
      userKeys,
      personalVault: createVault(accountKey, PERSONAL_VAULT_META),
      userKeyPair: createUserKeyPair(accountKey),
    };
  } catch (e) {
    wipe(accountKey);
    if (recoveryKey) wipe(recoveryKey);
    throw e;
  }
}
