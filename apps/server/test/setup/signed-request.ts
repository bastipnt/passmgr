import { getMessage, hkdf, signHmac } from "@repo/crypto";
import { fromString, toBase64 } from "@repo/util";

export type SignedSessionHeaders = {
  sessionId: string;
  timestamp: string;
  signature: string;
};

/**
 * Derive the same authKey the real client + server derive after a successful OPAQUE login.
 *
 *   sessionSecret = HKDF(sessionKey, "sessionSecret")
 *   authKey       = HKDF(sessionSecret, "sessionAuth", authSalt)
 */
export async function deriveAuthKey(sessionKey: string, authSalt: Uint8Array): Promise<Uint8Array> {
  const sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
  return await hkdf(sessionSecret, "sessionAuth", authSalt);
}

/**
 * Produce the three header strings the auth-middleware expects, given a real authKey,
 * an input payload, and the procedure path/type the client is about to call.
 */
export async function signRequest(opts: {
  authKey: Uint8Array;
  sessionId: string;
  type: "mutation" | "query" | "subscription";
  path: string;
  input: Record<string, unknown> | string | undefined;
  /** ms since epoch — defaults to now */
  timestamp?: number;
}): Promise<SignedSessionHeaders> {
  const timestamp = String(opts.timestamp ?? Date.now());
  const message = getMessage(
    opts.type,
    opts.path,
    timestamp,
    (opts.input ?? undefined) as unknown as Record<string, string>,
  );
  const sig = await signHmac(opts.authKey, message);
  return {
    sessionId: opts.sessionId,
    timestamp,
    signature: toBase64(sig),
  };
}
