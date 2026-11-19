import {
  type AKEExportKeyPair,
  getOpaqueConfig,
  OpaqueID,
  OpaqueServer,
} from "@cloudflare/opaque-ts";
import { OPAQUE_SERVER_IDENTITY } from "@repo/crypto";
import { fromBase64, fromString } from "@repo/util";
import { serverEnv } from "./env";

// Pure TypeScript on crypto.subtle, so one package runs on Bun, web and React Native.
// Why not @serenity-kit/opaque: docs/adr/0002-opaque-library.md.

export const opaqueConfig = getOpaqueConfig(OpaqueID.OPAQUE_P256);

// Losing either secret invalidates all registrations (apps/server/CLAUDE.md, env vars).
const akePrivBytes = fromBase64(serverEnv.OPAQUE_AKE_PRIVATE_KEY);
const akePublic = opaqueConfig.ake.recoverPublicKey(akePrivBytes);
const akeKeypair: AKEExportKeyPair = {
  private_key: Array.from(akePrivBytes),
  public_key: Array.from(akePublic.public_key),
};
const oprfSeed = Array.from(fromBase64(serverEnv.OPAQUE_OPRF_SEED));

// OpaqueServer holds no per-request state — the per-handshake `expected` blob
// is returned from authInit and threaded through Redis to authFinish. One
// shared instance is safe.
export const opaqueServer = new OpaqueServer(
  opaqueConfig,
  oprfSeed,
  akeKeypair,
  OPAQUE_SERVER_IDENTITY,
);

// The key for email hashing and encryption (hashEmail / encryptEmail): not part of
// OPAQUE despite the env var's name, and changing it breaks every email lookup.
export const serverSetup = serverEnv.OPAQUE_SERVER_SETUP;
export const serverKey = fromString(serverSetup);

export function bytesToB64(bytes: number[]): string {
  return Buffer.from(bytes).toString("base64");
}

export function b64ToBytes(s: string): number[] {
  return Array.from(fromBase64(s));
}
