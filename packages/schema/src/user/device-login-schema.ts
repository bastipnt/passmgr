import z from "zod";
import { finishLoginOutputSchema } from "./login-schema";

// A WebAuthn credential id is at most 1023 bytes.
const credentialIdSchema = z.base64().min(1).max(1400);
const key32Schema = z.base64().length(44);

export const startDeviceLoginInputSchema = z.object({ credentialId: credentialIdSchema });

export const startDeviceLoginOutputSchema = z.object({
  attemptId: z.uuid(),
  nonce: key32Schema,
  serverPublicKey: key32Schema,
});

export const finishDeviceLoginInputSchema = z.object({
  attemptId: z.uuid(),
  clientPublicKey: key32Schema,
  authenticatorData: z.base64().max(4096),
  clientDataJSON: z.base64().max(4096),
  signature: z.base64().max(1024),
  authSalt: key32Schema,
});

export const finishDeviceLoginOutputSchema = finishLoginOutputSchema;

export const registerDeviceCredentialInputSchema = z.object({
  credentialId: credentialIdSchema,
  publicKey: z.base64().max(2048),
  // COSE algorithm; the server takes ES256, EdDSA and RS256.
  algorithm: z.number().int(),
});

export const deviceCredentialInputSchema = z.object({ credentialId: credentialIdSchema });
