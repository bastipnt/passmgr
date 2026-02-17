import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { toBase64, fromString } from "@repo/util";
import { normalize } from "./util/string-utils";
import { hkdf } from "./hash";

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
  inputData: string,
): [encryptedData: Base64URLString, nonce: Base64URLString] {
  const nonce = randomBytes(24);

  const chacha = xchacha20poly1305(key, nonce);
  const data = fromString(inputData);
  const ciphertext = chacha.encrypt(data);

  return [toBase64(ciphertext), toBase64(nonce)];
}

// TODO: decryption
// const data_ = chacha.decrypt(ciphertext); // new TextDecoder().decode(data_) === data

/**
 * -------------------------- Application specific -------------------------------------------------
 */

/**
 * Encrypt the users email
 *
 * @param serverKey
 * @param email
 *
 * @returns encryptedEmail, nonce, salt
 */
export async function encryptEmail(
  serverKey: Uint8Array,
  email: string,
): Promise<
  [
    encryptedEmail: Base64URLString,
    emailNonce: Base64URLString,
    emailEncryptionKeySalt: Base64URLString,
  ]
> {
  const normalizedEmail = normalize(email);
  const emailEncryptionKeySalt = randomBytes(32);
  const emailEncryptionKey = await hkdf(serverKey, "emailEncryptionKey", emailEncryptionKeySalt);
  const [encryptedEmail, emailNonce] = encryptXChaCha(emailEncryptionKey, normalizedEmail);

  return [encryptedEmail, emailNonce, toBase64(emailEncryptionKeySalt)];
}
