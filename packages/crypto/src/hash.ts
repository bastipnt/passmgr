import { hkdfInfo } from "./util/constants";
import { hkdf as hkdf_, hmac, sha256 } from "@noble/hashes/webcrypto.js";
import { fromString } from "./util/format";
import { normalize } from "./util/string-utils";

/**
 * -------------------------- Key Derivation Functions (KDF) ---------------------------------------
 */

/**
 * HMAC-based Key Derivation Function (HKDF)
 * using sha256
 *
 * default length is 32
 *
 * @param inputKey
 * @param info
 * @param salt - optional
 *
 * @returns new key based on inputKey, info, and salt
 */
export async function hkdf(
  inputKey: Uint8Array,
  info: keyof typeof hkdfInfo,
  salt?: Uint8Array,
): Promise<Uint8Array> {
  const infoData = hkdfInfo[info];

  return await hkdf_(sha256, inputKey, salt, infoData, 32);
}

/**
 * -------------------------- Generation of Message Authentication Codes (MACs) --------------------
 */

/**
 * HMAC-SHA-256
 *
 * @param key
 * @param message
 *
 * @returns MAC
 */
export async function signHmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const msg = new TextEncoder().encode(message);
  return await hmac(sha256, key, msg);
}

/**
 * Verify the mac signature
 *
 * @param key
 * @param signature
 * @param message
 *
 * @returns boolean
 */
export async function verifyHmac(
  key: Uint8Array,
  signature: Uint8Array,
  message: string,
): Promise<boolean> {
  const lol = await signHmac(key, message);
  console.log({ lol, signature });

  const keyWebCrypto = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: sha256.webCryptoName },
    false,
    ["verify"],
  );

  return await crypto.subtle.verify(
    "HMAC",
    keyWebCrypto,
    signature as BufferSource,
    fromString(message) as BufferSource,
  );
}

/**
 * -------------------------- Application specific -------------------------------------------------
 */

/**
 * Create a hash from the users email to store in the db
 *
 * @param serverKey
 * @param email
 *
 * @returns hashed normalized email
 */
export async function hashEmail(serverKey: Uint8Array, email: string): Promise<Uint8Array> {
  const normalizedEmail = normalize(email);
  const emailHashKey = await hkdf(serverKey, "emailHashKey");
  return await signHmac(emailHashKey, normalizedEmail);
}
