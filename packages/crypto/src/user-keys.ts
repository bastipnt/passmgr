import type {
  EncryptedVaultMeta,
  RecoveryKeySchema,
  RecoveryWrapSchema,
  UserKeySchema,
  VaultKeyWrap,
  VaultMeta,
} from "@repo/schema";
import { fromBase64, fromString, toBase64 } from "@repo/util";
import { decryptXChaChaWithAAD, encryptXChaChaWithAAD } from "./encryption";
import { deriveRecoveryAuthKey, genPasswordKek, hashRecoveryAuthKey, hkdf } from "./hash";
import { genKey, genSalt, wipe } from "./util/secrets-utils";
import { encryptVaultMeta } from "./vault-data";

/*
 * Key hierarchy (ADR 0001 D3):
 *
 *   passwordKEK ─┬─wrap─► accountKey ──wrap─► vaultKey[vaultId] ──► records
 *   recoveryKEK ─┘
 *
 * Wraps carry AEAD associated data so a ciphertext only opens in its own slot.
 * The account key's AAD is purpose-only: the same wrap is used on every device,
 * and a wrap belonging to another user already fails on the wrong KEK. Vault
 * keys are bound to their vault and key version, so the server can't hand back
 * one of the user's vault keys in place of another.
 */

const ACCOUNT_KEY_AAD = fromString("passmgr/account-key/v1");

function vaultKeyAad(vaultId: string, keyVersion: number): Uint8Array {
  return fromString(`passmgr/vault-key/v1/${vaultId}/${keyVersion}`);
}

/** Wrap the account key under a KEK (password, recovery or biometric). */
export function wrapAccountKey(
  kek: Uint8Array,
  accountKey: Uint8Array,
): [encryptedAccountKey: string, nonce: string] {
  return encryptXChaChaWithAAD(kek, accountKey, ACCOUNT_KEY_AAD);
}

/** Throws when the KEK doesn't match the wrap (AEAD tag failure). */
export function unwrapAccountKey(
  kek: Uint8Array,
  encryptedAccountKey: string,
  nonce: string,
): Uint8Array {
  return decryptXChaChaWithAAD(kek, encryptedAccountKey, nonce, ACCOUNT_KEY_AAD);
}

export function wrapVaultKey(
  accountKey: Uint8Array,
  vaultKey: Uint8Array,
  vaultId: string,
  keyVersion: number,
): VaultKeyWrap {
  const [encryptedVaultKey, vaultKeyEncryptionNonce] = encryptXChaChaWithAAD(
    accountKey,
    vaultKey,
    vaultKeyAad(vaultId, keyVersion),
  );
  return { vaultId, keyVersion, encryptedVaultKey, vaultKeyEncryptionNonce };
}

/** Throws when the wrap was made for another vault / key version, or tampered with. */
export function unwrapVaultKey(accountKey: Uint8Array, wrap: VaultKeyWrap): Uint8Array {
  return decryptXChaChaWithAAD(
    accountKey,
    wrap.encryptedVaultKey,
    wrap.vaultKeyEncryptionNonce,
    vaultKeyAad(wrap.vaultId, wrap.keyVersion),
  );
}

/**
 * A fresh vault (random id + key, first key version): its key wrapped under the
 * account key and its metadata encrypted with the vault key.
 */
export function createVault(
  accountKey: Uint8Array,
  meta: VaultMeta,
): VaultKeyWrap & EncryptedVaultMeta & { keyVersion: 1 } {
  const vaultKey = genKey();
  const vaultId = crypto.randomUUID();
  try {
    return {
      ...wrapVaultKey(accountKey, vaultKey, vaultId, 1),
      ...encryptVaultMeta(vaultKey, vaultId, meta),
      keyVersion: 1,
    };
  } finally {
    wipe(vaultKey);
  }
}

/**
 * Wrap the account key under a fresh recovery key (HKDF, no Argon2), with the
 * server-side recovery verifier.
 *
 * @param accountKey the account key to wrap. It is not wiped.
 * @returns the recovery wrap + verifier and the new recoveryKey (show to the
 *   user once, never send to the server; the caller wipes it)
 */
export async function generateRecoveryKeys(
  accountKey: Uint8Array,
): Promise<RecoveryKeySchema & { recoveryKey: Uint8Array }> {
  const recoveryKey = genKey();
  const recoveryKekSaltData = genSalt();

  const recoveryKek = await hkdf(recoveryKey, "recoveryRootKey", recoveryKekSaltData);
  const recoveryAuthKey = await deriveRecoveryAuthKey(recoveryKey);
  const recoveryVerifier = toBase64(await hashRecoveryAuthKey(recoveryAuthKey));

  const [encryptedAccountKeyRecovery, accountKeyEncryptionNonceRecovery] = wrapAccountKey(
    recoveryKek,
    accountKey,
  );
  const recoveryKekSalt = toBase64(recoveryKekSaltData);

  for (const buf of [recoveryKekSaltData, recoveryKek, recoveryAuthKey]) wipe(buf);

  return {
    // only show to user, never sent to backend
    recoveryKey,
    recoveryKekSalt,
    recoveryVerifier,
    encryptedAccountKeyRecovery,
    accountKeyEncryptionNonceRecovery,
  };
}

/**
 * Build a complete key set for an account: the account key wrapped once under
 * the Argon2id password KEK and once under a fresh recovery key, plus the
 * server-side recovery verifier.
 *
 * @param password master password
 * @param accountKey the account key to wrap. Registration passes a new one
 *   (`genKey()`), recovery the unwrapped existing one. It is not wiped.
 *
 * @returns the key set for the server and the new recoveryKey (show to the
 *   user once, never send to the server; the caller wipes it)
 */
export async function generateUserKeys(
  password: string,
  accountKey: Uint8Array,
): Promise<UserKeySchema & { recoveryKey: Uint8Array }> {
  const { passwordKek, passwordKekParams, passwordKekSaltData } = await genPasswordKek(password);
  const [encryptedAccountKey, accountKeyEncryptionNonce] = wrapAccountKey(passwordKek, accountKey);
  const passwordKekSalt = toBase64(passwordKekSaltData);
  wipe(passwordKek);
  wipe(passwordKekSaltData);

  return {
    ...(await generateRecoveryKeys(accountKey)),
    passwordKekParams,
    passwordKekSalt,
    encryptedAccountKey,
    accountKeyEncryptionNonce,
  };
}

/**
 * Decrypt the recovery copy of the account key. Throws when the recovery key
 * doesn't match the wrap (AEAD tag failure).
 */
export async function unwrapAccountKeyWithRecoveryKey(
  recoveryKey: Uint8Array,
  wrap: RecoveryWrapSchema,
): Promise<Uint8Array> {
  const recoveryKek = await hkdf(recoveryKey, "recoveryRootKey", fromBase64(wrap.recoveryKekSalt));
  try {
    return unwrapAccountKey(
      recoveryKek,
      wrap.encryptedAccountKeyRecovery,
      wrap.accountKeyEncryptionNonceRecovery,
    );
  } finally {
    wipe(recoveryKek);
  }
}
