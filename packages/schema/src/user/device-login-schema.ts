import z from "zod";
import { canonicalBase64 } from "../base64-schema";
import { finishLoginOutputSchema } from "./login-schema";

/** COSE algorithm ids (IANA registry) of the device credentials the server can verify. */
export const COSE_ALG = { ES256: -7, EdDSA: -8, RS256: -257 } as const;

/** Offered at enrollment in this order of preference (WebAuthn `pubKeyCredParams`). */
export const SUPPORTED_COSE_ALGS = [COSE_ALG.ES256, COSE_ALG.EdDSA, COSE_ALG.RS256] as const;

// A WebAuthn credential id is at most 1023 bytes.
const credentialIdSchema = canonicalBase64().min(1).max(1400);
const key32Schema = canonicalBase64().length(44);

/** How long the server keeps a started device login waiting for its signed assertion. */
export const DEVICE_LOGIN_TTL_MS = 5 * 60_000;

export const startDeviceLoginInputSchema = z.object({ credentialId: credentialIdSchema });

export const startDeviceLoginOutputSchema = z.object({
  attemptId: z.uuid(),
  nonce: key32Schema,
  serverPublicKey: key32Schema,
});

export const finishDeviceLoginInputSchema = z.object({
  attemptId: z.uuid(),
  clientPublicKey: key32Schema,
  authenticatorData: canonicalBase64().max(4096),
  clientDataJSON: canonicalBase64().max(4096),
  signature: canonicalBase64().max(1024),
  authSalt: key32Schema,
});

export const finishDeviceLoginOutputSchema = finishLoginOutputSchema;

export const registerDeviceCredentialInputSchema = z.object({
  credentialId: credentialIdSchema,
  publicKey: canonicalBase64().max(2048),
  // COSE algorithm; the server verifies only `SUPPORTED_COSE_ALGS`.
  algorithm: z.int32(),
});

export const deviceCredentialInputSchema = z.object({ credentialId: credentialIdSchema });
