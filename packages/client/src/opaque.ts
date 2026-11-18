import {
  getOpaqueConfig,
  OpaqueClient,
  OpaqueID,
  type RegistrationClient,
  RegistrationResponse,
} from "@cloudflare/opaque-ts";
import { deriveOpaquePassword, OPAQUE_SERVER_IDENTITY, wipe } from "@repo/crypto";
import { opaqueKsf } from "@repo/crypto/services/opaque-ksf";
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

/** A registration's OPAQUE input (`deriveOpaquePassword`). */
export async function opaqueInputFor(password: string, email: string): Promise<string> {
  const opaquePassword = await deriveOpaquePassword(password, email);
  try {
    return opaqueInput(opaquePassword);
  } finally {
    wipe(opaquePassword);
  }
}

/**
 * The client half of an OPAQUE registration for `input` (`opaqueInput` / `opaqueInputFor`):
 * `send` delivers the request (base64) and returns the server's reply, whose
 * `registrationResponse` finishes it. A request or response opaque-ts rejects throws
 * `failed("start")`, a failed finish `failed("finish")`; errors from `send` pass through.
 *
 * @returns the reply and the registration record (base64) for the server to store
 */
export async function registerOpaque<Reply extends { registrationResponse: string }>(
  input: string,
  email: string,
  send: (registrationRequest: string) => Promise<Reply>,
  failed: (phase: "start" | "finish") => Error,
): Promise<{ reply: Reply; registrationRecord: string }> {
  const client: RegistrationClient = new OpaqueClient(opaqueConfig, opaqueKsf);
  const req = await client.registerInit(input);
  if (req instanceof Error) throw failed("start");
  const reply = await send(bytesToB64(req.serialize()));
  let resp: RegistrationResponse;
  try {
    resp = RegistrationResponse.deserialize(opaqueConfig, b64ToBytes(reply.registrationResponse));
  } catch {
    throw failed("start");
  }
  const finished = await client.registerFinish(resp, OPAQUE_SERVER_IDENTITY, email);
  if (finished instanceof Error) throw failed("finish");
  return { reply, registrationRecord: bytesToB64(finished.record.serialize()) };
}
