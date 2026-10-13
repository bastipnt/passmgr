import { getOpaqueConfig, OpaqueID } from "@cloudflare/opaque-ts";
import { deriveOpaquePassword, wipe } from "@repo/crypto";
import { fromBase64, toBase64 } from "@repo/util";

export const opaqueConfig = getOpaqueConfig(OpaqueID.OPAQUE_P256);

export function bytesToB64(bytes: number[]): string {
  return toBase64(Uint8Array.from(bytes));
}

export function b64ToBytes(s: string): number[] {
  return Array.from(fromBase64(s));
}

/** What opaque-ts gets as the password: never the password itself, see `deriveOpaquePassword`. */
export function opaqueInput(opaquePassword: Uint8Array): string {
  return toBase64(opaquePassword);
}

export async function opaqueInputFor(password: string, email: string): Promise<string> {
  const opaquePassword = await deriveOpaquePassword(password, email);
  try {
    return opaqueInput(opaquePassword);
  } finally {
    wipe(opaquePassword);
  }
}
