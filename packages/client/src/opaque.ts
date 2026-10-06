import { getOpaqueConfig, OpaqueID } from "@cloudflare/opaque-ts";
import { fromBase64, toBase64 } from "@repo/util";

export const opaqueConfig = getOpaqueConfig(OpaqueID.OPAQUE_P256);

// Must match OPAQUE_SERVER_IDENTITY on the server (default "passmgr").
// server_identity / client_identity bind the envelope MAC, so registration,
// recovery and login must all use the same value.
export const SERVER_IDENTITY = "passmgr";

export function bytesToB64(bytes: number[]): string {
  return toBase64(Uint8Array.from(bytes));
}

export function b64ToBytes(s: string): number[] {
  return Array.from(fromBase64(s));
}
