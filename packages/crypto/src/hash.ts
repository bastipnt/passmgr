import { hkdf as hkdf_, hmac, sha256 } from "@noble/hashes/webcrypto.js";
import { fromString } from "@repo/util";
import { type ArgonOpts, argon2idAsync } from "./util/argon2-impl";
import { hkdfInfo } from "./util/constants";
import { genSalt, wipe } from "./util/secrets-utils";
import { normalize, normalizeEmail } from "./util/string-utils";

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
 * Recovery auth key: proves possession of the recovery key to the server
 * without revealing it. Independent of the recovery KEK (different HKDF info),
 * so the server can't unwrap the recovery copy of the vault key with it.
 *
 * @param recoveryKey 32 random bytes shown to the user at registration
 *
 * @returns 32-byte auth key (sent to the server only during recovery)
 */
export async function deriveRecoveryAuthKey(recoveryKey: Uint8Array): Promise<Uint8Array> {
  return await hkdf(recoveryKey, "recoveryAuth");
}

/**
 * Server-side verifier for a recovery auth key: SHA-256(recoveryAuthKey).
 * The auth key has 256 bits of entropy, so a plain hash can't be brute-forced
 * from a DB dump.
 *
 * @param recoveryAuthKey
 *
 * @returns 32-byte verifier
 */
export async function hashRecoveryAuthKey(recoveryAuthKey: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", recoveryAuthKey as BufferSource));
}

/**
 * What OPAQUE gets instead of the password (registration, login, password
 * change, recovery). A device keeps it to reconnect or re-run the login after
 * a biometric unlock: unlike the password string it can be wiped, and it is
 * worthless for any other account or site.
 */
export async function deriveOpaquePassword(password: string, email: string): Promise<Uint8Array> {
  const passwordBytes = fromString(password);
  try {
    return await hkdf(passwordBytes, "opaquePassword", fromString(normalizeEmail(email)));
  } finally {
    wipe(passwordBytes);
  }
}

/**
 * Argon2id sets for the password KEK, strongest first. A stored wrap carries its
 * own params, so a set can be added or dropped without breaking an unlock. The
 * last one is the floor (Bitwarden's default): a device too slow for a stronger
 * set gets that one, never anything weaker.
 */
export const PASSWORD_KEK_PARAM_SETS: readonly ArgonOpts[] = [
  { t: 3, m: 128 * 1024, p: 4 },
  { t: 3, m: 64 * 1024, p: 4 },
];

const PASSWORD_KEK_FLOOR = PASSWORD_KEK_PARAM_SETS.at(-1) as ArgonOpts;

/** Time the KEK derivation may take on this device (the unlock target is < 2 s). */
export const PASSWORD_KEK_BUDGET_MS = 1000;

const CALIBRATION_PARAMS: ArgonOpts = { t: 1, m: 16 * 1024, p: 4 };

let activePasswordKekParams: ArgonOpts = PASSWORD_KEK_PARAM_SETS[0] as ArgonOpts;
let pinned = false;

/** Fixes the params for new wraps; `calibratePasswordKekParams` then leaves them alone. */
export function setPasswordKekParams(params: ArgonOpts): void {
  activePasswordKekParams = params;
  pinned = true;
}

export function getPasswordKekParams(): ArgonOpts {
  return activePasswordKekParams;
}

// `p` only splits the same memory and passes into lanes: it speeds up the
// defender, not the attacker's cost, so it doesn't count.
function isWeaker(a: ArgonOpts, b: ArgonOpts): boolean {
  return a.m < b.m || a.m * a.t < b.m * b.t;
}

/**
 * Whether a stored wrap should be redone with this device's params. Only below
 * the floor, and only as an upgrade: the wrap is shared by every device of an
 * account, so rekeying to each device's own choice would make them take turns.
 */
export function needsPasswordKekRekey(stored: ArgonOpts): boolean {
  return isWeaker(stored, PASSWORD_KEK_FLOOR) && isWeaker(stored, activePasswordKekParams);
}

/** The strongest set that `msPerKibIteration` (time per KiB × iteration) fits into the budget. */
export function selectPasswordKekParams(
  msPerKibIteration: number,
  budgetMs = PASSWORD_KEK_BUDGET_MS,
): ArgonOpts {
  return (
    PASSWORD_KEK_PARAM_SETS.find((set) => msPerKibIteration * set.m * set.t <= budgetMs) ??
    PASSWORD_KEK_FLOOR
  );
}

/**
 * Times a small derivation with `derive` (the one unlock uses on this
 * platform) and makes the fitting set the params for new wraps. Argon2's cost
 * grows linearly with memory × iterations, so a 16 MiB pass predicts the rest.
 * Measured twice, the faster run counts: the first one may pay a worker start.
 */
export async function calibratePasswordKekParams(
  derive: (salt: Uint8Array, params: ArgonOpts) => Promise<unknown>,
): Promise<ArgonOpts> {
  if (pinned) return activePasswordKekParams;
  const salt = genSalt();
  let fastest = Number.POSITIVE_INFINITY;
  for (let run = 0; run < 2; run++) {
    const started = performance.now();
    await derive(salt, CALIBRATION_PARAMS);
    fastest = Math.min(fastest, performance.now() - started);
  }
  if (pinned) return activePasswordKekParams;
  activePasswordKekParams = selectPasswordKekParams(
    fastest / (CALIBRATION_PARAMS.m * CALIBRATION_PARAMS.t),
  );
  return activePasswordKekParams;
}

/**
 * Generate Password Root Key (PRK)
 *
 * @param password
 *
 * @returns PRK, params and salt
 */
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
