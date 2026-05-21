import {
  OpaqueID,
  OpaqueServer,
  getOpaqueConfig,
  type AKEExportKeyPair,
} from "@cloudflare/opaque-ts";
import { fromBase64, fromString } from "@repo/util";

// Cloudflare opaque-ts is pure TypeScript (uses crypto.subtle, no WASM) so the
// same package runs on the Bun server, web (Vite), and React Native (with a
// crypto.subtle polyfill like react-native-quick-crypto). This replaces
// @serenity-kit/opaque whose 0.8 ↔ 1.x split caused mobile login failures.
//
// BREAKING: the wire format and registration record encoding differ from
// serenity v1. Existing users must re-register after this migration.

export const opaqueConfig = getOpaqueConfig(OpaqueID.OPAQUE_P256);
export const serverIdentity = process.env.OPAQUE_SERVER_IDENTITY ?? "passmgr";

// Server-side OPAQUE setup. Generate once with `bun apps/server/scripts/opaque-cf-bootstrap.ts`
// and persist as env vars (base64). Losing either secret invalidates all
// registrations.
//   OPAQUE_OPRF_SEED         — Nh random bytes (32 for SHA-256/P256), seeds
//                              per-user OPRF keys.
//   OPAQUE_AKE_PRIVATE_KEY   — server long-term AKE keypair private scalar.
const oprfSeedRaw = process.env.OPAQUE_OPRF_SEED;
const akePrivRaw = process.env.OPAQUE_AKE_PRIVATE_KEY;
if (!oprfSeedRaw || !akePrivRaw) {
  throw new Error(
    "OPAQUE_OPRF_SEED and OPAQUE_AKE_PRIVATE_KEY must be set. Run bun apps/server/scripts/opaque-cf-bootstrap.ts to generate.",
  );
}

const akePrivBytes = fromBase64(akePrivRaw);
const akePublic = opaqueConfig.ake.recoverPublicKey(akePrivBytes);
const akeKeypair: AKEExportKeyPair = {
  private_key: Array.from(akePrivBytes),
  public_key: Array.from(akePublic.public_key),
};
const oprfSeed = Array.from(fromBase64(oprfSeedRaw));

// OpaqueServer holds no per-request state — the per-handshake `expected` blob
// is returned from authInit and threaded through Redis to authFinish. One
// shared instance is safe.
export const opaqueServer = new OpaqueServer(opaqueConfig, oprfSeed, akeKeypair, serverIdentity);

// `serverKey` is the HMAC/encryption key for email hashing and email-at-rest
// encryption (see hashEmail / encryptEmail). It is independent of the OPAQUE
// protocol; keep using the existing OPAQUE_SERVER_SETUP env var so the email
// HMAC stays stable across this migration.
export const serverSetup = process.env.OPAQUE_SERVER_SETUP!;
export const serverKey = fromString(serverSetup);

export function bytesToB64(bytes: number[]): string {
  return Buffer.from(bytes).toString("base64");
}

export function b64ToBytes(s: string): number[] {
  return Array.from(fromBase64(s));
}
