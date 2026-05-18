import { hkdfInfo } from "./util/constants";
import { hkdf as hkdf_, hmac, sha256 } from "@noble/hashes/webcrypto.js";
import { fromString } from "@repo/util";
import { normalize } from "./util/string-utils";
import { genSalt } from "./util/secrets-utils";
import { argon2idAsync, type ArgonOpts } from "@noble/hashes/argon2.js";

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

/**
 * Generate Password Root Key (PRK)
 *
 * @param password
 *
 * @returns PRK, params and salt
 */
/**
 * | Parameter       | Value     |
 * | --------------- | --------- |
 * | Memory (m)      | 64–256 MB |
 * | Iterations (t)  | 3         |
 * | Parallelism (p) | 1–4       |
 * | Output length   | 32 bytes  |
 * | Variant         | Argon2id  |
 *
 * TODO: version parameters and adjust to client
 */
const PROD_PASSWORD_KEK_PARAMS: ArgonOpts = { t: 3, m: 128 * 1024, p: 1 };

let activePasswordKekParams: ArgonOpts = PROD_PASSWORD_KEK_PARAMS;

export function setPasswordKekParams(params: ArgonOpts): void {
  activePasswordKekParams = params;
}

export function getPasswordKekParams(): ArgonOpts {
  return activePasswordKekParams;
}

export async function genPasswordKek(
  password: string,
  passwordKekParams: ArgonOpts = activePasswordKekParams,
): Promise<{
  passwordKek: Uint8Array;
  passwordKekParams: ArgonOpts;
  passwordKekSaltData: Uint8Array;
}> {
  const passwordKekSaltData = genSalt();

  const passwordKek = await argon2idAsync(password, passwordKekSaltData, {
    ...passwordKekParams,
    maxmem: 2 ** 32 - 1,
  });
  return { passwordKek, passwordKekParams, passwordKekSaltData };
}

/**
 * Retrieve Password Root Key (PRK)
 *
 * @param password
 * @param passwordKekSaltData
 * @param passwordKekParams
 *
 * @returns PRK
 */
export async function retrievePRK(
  password: string,
  passwordKekSaltData: Uint8Array,
  passwordKekParams: ArgonOpts,
): Promise<Uint8Array> {
  return await argon2idAsync(password, passwordKekSaltData, passwordKekParams);
}
