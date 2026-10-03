// XChaCha20-Poly1305 primitives. Kept free of the KDF code (and its Argon2
// import) so the decrypt worker can bundle them on their own.
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { fromBase64, fromString, toBase64 } from "@repo/util";

/**
 * -------------------------- Encryption functions -------------------------------------------------
 */

/**
 * AEAD encryption with XChaCha20-Poly1305
 *
 * @param key
 * @param inputData
 * @returns [encryptedData, nonce]
 */
export function encryptXChaCha(
  key: Uint8Array,
  inputData: string | Uint8Array,
): [encryptedData: string, nonce: string] {
  const nonce = randomBytes(24);

  const chacha = xchacha20poly1305(key, nonce);
  const data = typeof inputData === "string" ? fromString(inputData) : inputData;
  const ciphertext = chacha.encrypt(data);

  return [toBase64(ciphertext), toBase64(nonce)];
}

export function encryptXChaChaWithAAD(
  key: Uint8Array,
  inputData: string | Uint8Array,
  aad: Uint8Array,
): [encryptedData: string, nonce: string] {
  const nonce = randomBytes(24);
  const chacha = xchacha20poly1305(key, nonce, aad);
  const data = typeof inputData === "string" ? fromString(inputData) : inputData;
  const ciphertext = chacha.encrypt(data);
  return [toBase64(ciphertext), toBase64(nonce)];
}

export function decryptXChaCha(key: Uint8Array, encryptedData: string, nonce: string): Uint8Array {
  const chacha = xchacha20poly1305(key, fromBase64(nonce));
  return chacha.decrypt(fromBase64(encryptedData));
}

export function decryptXChaChaWithAAD(
  key: Uint8Array,
  encryptedData: string,
  nonce: string,
  aad: Uint8Array,
): Uint8Array {
  const chacha = xchacha20poly1305(key, fromBase64(nonce), aad);
  return chacha.decrypt(fromBase64(encryptedData));
}
