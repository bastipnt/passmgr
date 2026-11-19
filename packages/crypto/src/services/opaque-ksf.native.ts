// Native scrypt: pure-JS scrypt takes ~20-30 s on Hermes. Same params, byte-identical output
// (packages/crypto/CLAUDE.md, OPAQUE KSF).
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
