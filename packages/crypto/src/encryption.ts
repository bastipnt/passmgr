import { randomBytes } from "@noble/hashes/utils.js";
import { fromBase64, toBase64 } from "@repo/util";
import { hkdf } from "./hash";
import { decryptXChaCha, encryptXChaCha } from "./util/aead";
import { normalize } from "./util/string-utils";

export {
  decryptXChaCha,
  decryptXChaChaWithAAD,
  encryptXChaCha,
  encryptXChaChaWithAAD,
} from "./util/aead";

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
): Promise<[encryptedEmail: string, emailNonce: string, emailEncryptionKeySalt: string]> {
  const normalizedEmail = normalize(email);
  const emailEncryptionKeySalt = randomBytes(32);
  const emailEncryptionKey = await hkdf(serverKey, "emailEncryptionKey", emailEncryptionKeySalt);
  const [encryptedEmail, emailNonce] = encryptXChaCha(emailEncryptionKey, normalizedEmail);

  return [encryptedEmail, emailNonce, toBase64(emailEncryptionKeySalt)];
}

/** Open an `encryptEmail` ciphertext (e.g. to show a vault's members to each other). */
export async function decryptEmail(
  serverKey: Uint8Array,
  encryptedEmail: string,
  emailNonce: string,
  emailEncryptionKeySalt: string,
): Promise<string> {
  const emailEncryptionKey = await hkdf(
    serverKey,
    "emailEncryptionKey",
    fromBase64(emailEncryptionKeySalt),
  );
  return new TextDecoder().decode(decryptXChaCha(emailEncryptionKey, encryptedEmail, emailNonce));
}
