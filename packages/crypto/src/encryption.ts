import { randomBytes } from "@noble/hashes/utils.js";
import { toBase64 } from "@repo/util";
import { hkdf } from "./hash";
import { encryptXChaCha } from "./util/aead";
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
