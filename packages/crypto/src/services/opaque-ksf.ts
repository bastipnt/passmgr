// OPAQUE key-stretching function (KSF), web/default variant.
//
// Mirrors @cloudflare/opaque-ts's built-in ScryptMemHardFn exactly
// (scrypt N=32768, r=8, p=1, empty salt, 32-byte output) so the value is
// byte-identical to what the library uses by default — required for
// compatibility with existing OPAQUE registrations. Injected into OpaqueClient
// so the mobile (.native.ts) variant can swap in native scrypt without the
// pure-JS version freezing the JS thread for ~20-30s on Hermes.
import { scrypt } from "@noble/hashes/scrypt.js";

export interface OpaqueKsf {
  readonly name: string;
  readonly harden: (input: Uint8Array) => Uint8Array;
}

export const opaqueKsf: OpaqueKsf = {
  name: "scrypt",
  harden: (input) => scrypt(input, new Uint8Array(), { N: 32768, r: 8, p: 1 }),
};
