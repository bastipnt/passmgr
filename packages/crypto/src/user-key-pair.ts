import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, randomBytes } from "@noble/hashes/utils.js";
import type { UserKeyPair } from "@repo/schema";
import { fromBase64, fromString, toBase64 } from "@repo/util";
import { decryptXChaChaWithAAD, encryptXChaChaWithAAD } from "./encryption";
import { hkdf } from "./hash";
import { genKey, wipe } from "./util/secrets-utils";

/*
 * The user's X25519 keypair (ADR 0001 D7): the public key is published so
 * others can seal a vault key to it; the private key is wrapped by the account
 * key like a vault key. It is generated once (registration or local vault
 * creation) and survives password changes and recovery, which only rewrap the
 * account key.
 */

const KEY_BYTES = 32;
const NONCE_BYTES = 24;

function privateKeyAad(keyVersion: number): Uint8Array {
  return fromString(`passmgr/user-private-key/v1/${keyVersion}`);
}

/** A fresh keypair (first key version), the private key wrapped under the account key. */
export function createUserKeyPair(accountKey: Uint8Array): UserKeyPair & { keyVersion: 1 } {
  const privateKey = genKey();
  try {
    const keyVersion = 1;
    const [encryptedPrivateKey, privateKeyEncryptionNonce] = encryptXChaChaWithAAD(
      accountKey,
      privateKey,
      privateKeyAad(keyVersion),
    );
    return {
      keyVersion,
      publicKey: toBase64(x25519.getPublicKey(privateKey)),
      encryptedPrivateKey,
      privateKeyEncryptionNonce,
    };
  } finally {
    wipe(privateKey);
  }
}

/**
 * Unwrap the private key. Throws when the wrap doesn't open (wrong account key,
 * other key version, tampered) or doesn't belong to the wrap's public key, so a
 * server can't pair a public key with someone else's private key.
 */
export function unwrapUserPrivateKey(accountKey: Uint8Array, keyPair: UserKeyPair): Uint8Array {
  const privateKey = decryptXChaChaWithAAD(
    accountKey,
    keyPair.encryptedPrivateKey,
    keyPair.privateKeyEncryptionNonce,
    privateKeyAad(keyPair.keyVersion),
  );
  if (toBase64(x25519.getPublicKey(privateKey)) !== keyPair.publicKey) {
    wipe(privateKey);
    throw new Error("Private key doesn't match the public key");
  }
  return privateKey;
}

/**
 * Short verification code for a public key: 30 digits in groups of five.
 * Both sides display it and compare out of band, so a server handing out its
 * own key in place of the invitee's is detected. ~100 bits, out of reach of a
 * second-preimage search for a matching key.
 */
export function publicKeyFingerprint(publicKeyB64: string): string {
  const digest = sha256(
    concatBytes(fromString("passmgr/public-key-fingerprint/v1"), fromBase64(publicKeyB64)),
  );
  const groups: string[] = [];
  for (let i = 0; i < 30; i += 5) {
    // 40 bits per group, reduced to five digits (bias ~1e-7, irrelevant here).
    let chunk = 0;
    for (const byte of digest.subarray(i, i + 5)) chunk = chunk * 256 + byte;
    groups.push(String(chunk % 100_000).padStart(5, "0"));
  }
  return groups.join(" ");
}

async function sealKey(
  ephemeralShared: Uint8Array,
  staticShared: Uint8Array,
  epk: Uint8Array,
  recipientPk: Uint8Array,
  senderPk: Uint8Array,
) {
  // Both secrets in, all three public keys in the salt: the key is bound to
  // this ephemeral key, this recipient and this sender (HPKE's auth mode).
  const ikm = concatBytes(ephemeralShared, staticShared);
  try {
    return await hkdf(ikm, "sealKey", concatBytes(epk, recipientPk, senderPk));
  } finally {
    wipe(ikm);
  }
}

/**
 * Encrypt to a public key, authenticated by the sender's static key (in the
 * style of HPKE's auth mode): ephemeral X25519 and sender × recipient X25519 →
 * HKDF → XChaCha20-Poly1305. Only the holder of the recipient's private key
 * can open it, and only with the sender's public key: a box opens under the
 * key of whoever sealed it, so a server can't forge an invite in a member's
 * name (ADR 0001 D7) without that member's private key.
 *
 * @param aad context the ciphertext is bound to (e.g. vault id + key version);
 *   `unsealFromPublicKey` must pass the same
 * @returns base64 of `ephemeralPublicKey ‖ nonce ‖ ciphertext`
 */
export async function sealToPublicKey(
  senderPrivateKey: Uint8Array,
  recipientPublicKeyB64: string,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<string> {
  const recipientPk = fromBase64(recipientPublicKeyB64);
  const esk = genKey();
  const secrets: Uint8Array[] = [esk];
  try {
    const epk = x25519.getPublicKey(esk);
    // Each throws on a low-order recipient key (all-zero shared secret).
    const ephemeralShared = x25519.getSharedSecret(esk, recipientPk);
    secrets.push(ephemeralShared);
    const staticShared = x25519.getSharedSecret(senderPrivateKey, recipientPk);
    secrets.push(staticShared);
    const senderPk = x25519.getPublicKey(senderPrivateKey);
    const key = await sealKey(ephemeralShared, staticShared, epk, recipientPk, senderPk);
    secrets.push(key);
    const nonce = randomBytes(NONCE_BYTES);
    const ciphertext = xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
    return toBase64(concatBytes(epk, nonce, ciphertext));
  } finally {
    for (const secret of secrets) wipe(secret);
  }
}

/**
 * Open a `sealToPublicKey` box from `senderPublicKeyB64`. Throws on the wrong
 * recipient key, another sender, the wrong AAD or tampering.
 */
export async function unsealFromPublicKey(
  privateKey: Uint8Array,
  senderPublicKeyB64: string,
  sealedB64: string,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const sealed = fromBase64(sealedB64);
  if (sealed.length < KEY_BYTES + NONCE_BYTES) throw new Error("Sealed box too short");
  const senderPk = fromBase64(senderPublicKeyB64);

  const epk = sealed.subarray(0, KEY_BYTES);
  const nonce = sealed.subarray(KEY_BYTES, KEY_BYTES + NONCE_BYTES);
  const ciphertext = sealed.subarray(KEY_BYTES + NONCE_BYTES);

  const secrets: Uint8Array[] = [];
  try {
    const ephemeralShared = x25519.getSharedSecret(privateKey, epk);
    secrets.push(ephemeralShared);
    const staticShared = x25519.getSharedSecret(privateKey, senderPk);
    secrets.push(staticShared);
    const key = await sealKey(
      ephemeralShared,
      staticShared,
      epk,
      x25519.getPublicKey(privateKey),
      senderPk,
    );
    secrets.push(key);
    return xchacha20poly1305(key, nonce, aad).decrypt(ciphertext);
  } finally {
    for (const secret of secrets) wipe(secret);
  }
}

function vaultKeySealAad(vaultId: string, keyVersion: number): Uint8Array {
  return fromString(`passmgr/vault-key-seal/v1/${vaultId}/${keyVersion}`);
}

/**
 * Seal a vault key to a member's public key (an invite, or the new key after a
 * rotation), from the sender's keypair. Bound to the vault and key version.
 */
export async function sealVaultKey(
  senderPrivateKey: Uint8Array,
  recipientPublicKeyB64: string,
  vaultKey: Uint8Array,
  vaultId: string,
  keyVersion: number,
): Promise<string> {
  return await sealToPublicKey(
    senderPrivateKey,
    recipientPublicKeyB64,
    vaultKey,
    vaultKeySealAad(vaultId, keyVersion),
  );
}

/** Open a `sealVaultKey` box. Throws unless `senderPublicKeyB64` sealed it for this slot. */
export async function openSealedVaultKey(
  privateKey: Uint8Array,
  senderPublicKeyB64: string,
  sealedB64: string,
  vaultId: string,
  keyVersion: number,
): Promise<Uint8Array> {
  return await unsealFromPublicKey(
    privateKey,
    senderPublicKeyB64,
    sealedB64,
    vaultKeySealAad(vaultId, keyVersion),
  );
}
