import z from "zod";
import { memberVaultSchema } from "../vault-schema";
import { emailSchema } from "./email-schema";
import { passwordKeySchema, userKeyPairSchema } from "./key-schema";

export const startLoginInputSchema = z.object({
  email: emailSchema,
  startLoginRequest: z.string(),
});

export const startLoginOutputSchema = z.object({
  loginResponse: z.string(),
  // Identifies this login handshake; must be passed back to finishLogin.
  attemptId: z.uuid(),
});

export const finishLoginInputSchema = z.object({
  email: emailSchema,
  attemptId: z.uuid(),
  finishLoginRequest: z.string(),
  // 32 bytes base64-encoded with padding
  authSalt: z.base64().length(44),
});

export const finishLoginOutputSchema = z.object({
  sessionId: z.string(),
  // Ties the device profile to the account (ADR 0001 D2), so a login into
  // another account is noticed before its keys meet this device's data.
  userId: z.string(),
  userPasswordKeys: passwordKeySchema,
  vaultKeys: z.array(memberVaultSchema),
  userKeyPair: userKeyPairSchema,
});

/**
 * `logout` has nothing to send, but clients send `{}`: a POST without a body
 * is rejected by the HTTP adapter ("Unexpected end of JSON input") before the
 * procedure runs.
 */
export const logoutInputSchema = z.object({}).strict().optional();
