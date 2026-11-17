import { scrypt } from "@noble/hashes/scrypt.js";

/**
 * OPAQUE's key-stretching function, as @cloudflare/opaque-ts's built-in
 * ScryptMemHardFn computes it (N=32768, r=8, p=1, empty salt, 32 bytes): the
 * value must stay byte-identical, or existing registrations stop opening.
 */
export const OPAQUE_SCRYPT_PARAMS = { N: 32768, r: 8, p: 1 } as const;

export function opaqueScrypt(input: Uint8Array): Uint8Array {
  return scrypt(input, new Uint8Array(), OPAQUE_SCRYPT_PARAMS);
}
