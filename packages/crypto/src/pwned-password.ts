import { sha1 } from "@noble/hashes/legacy.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export const PWNED_PREFIX_LENGTH = 5;

/**
 * SHA-1 only because the HIBP range API is keyed by it; never use it as a security hash.
 *
 * A password's SHA-1, split for the HIBP range API (k-anonymity): only `prefix`
 * may leave the device, `suffix` is matched against the response locally.
 */
export function pwnedPasswordHash(password: string): { prefix: string; suffix: string } {
  const hash = bytesToHex(sha1(utf8ToBytes(password))).toUpperCase();
  return { prefix: hash.slice(0, PWNED_PREFIX_LENGTH), suffix: hash.slice(PWNED_PREFIX_LENGTH) };
}
