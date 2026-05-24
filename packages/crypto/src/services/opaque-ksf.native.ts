// OPAQUE key-stretching function (KSF), React Native variant.
//
// The default ScryptMemHardFn in @cloudflare/opaque-ts runs pure-JS @noble
// scrypt (N=32768 → 32MB) on the JS thread. On Hermes (no JIT) that takes
// ~20-30s inside authFinish — the dominant mobile login cost. react-native-
// quick-crypto provides a native scrypt; with identical params the output is
// byte-identical to the pure-JS version, so existing registrations and the web
// client stay compatible — only execution moves to native code.
//
// Metro auto-picks this file over `opaque-ksf.ts` for ios/android bundles.
import { scryptSync } from "react-native-quick-crypto";

export interface OpaqueKsf {
  readonly name: string;
  readonly harden: (input: Uint8Array) => Uint8Array;
}

// scrypt work buffer is 128 * r * N bytes (~32MB here); give maxmem headroom.
const SCRYPT_OPTS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export const opaqueKsf: OpaqueKsf = {
  name: "scrypt",
  harden: (input) => {
    const out = scryptSync(input, new Uint8Array(), 32, SCRYPT_OPTS);
    return Uint8Array.from(out);
  },
};
