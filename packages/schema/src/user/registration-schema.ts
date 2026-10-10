import z from "zod";
import { linkedVaultInputSchema } from "../vault-schema";
import { emailSchema } from "./email-schema";
import { userKeyPairSchema, userKeySchema } from "./key-schema";

/**
 * Start registration
 */
export const startRegistrationInputSchema = z.object({
  email: emailSchema,
  registrationRequest: z.string(),
  // One-time invite code; required only while REGISTRATION_DISABLED=true.
  invite: z.string().max(128).optional(),
});

export const startRegistrationOutputSchema = z.object({
  registrationResponse: z.string(),
});

/** At most this many vaults besides the personal one at registration (linking a local vault). */
export const MAX_REGISTRATION_VAULTS = 100;

/**
 * Finish registration
 */
export const finishRegistrationInputSchema = z.object({
  email: emailSchema,
  registrationRecord: z.string(),
  userKeys: userKeySchema,
  // The default vault: created together with the account (first key version, no
  // earlier keys), or a linked local vault's as it is (ADR 0001 D9).
  personalVault: linkedVaultInputSchema,
  // The X25519 keypair for sharing (first key version).
  userKeyPair: userKeyPairSchema.extend({ keyVersion: z.literal(1) }),
  // Linking a local vault (ADR 0001 D9): its other vaults, uploaded with their keys as they are.
  vaults: z.array(linkedVaultInputSchema).max(MAX_REGISTRATION_VAULTS).optional(),
  invite: z.string().max(128).optional(),
});

export type FinishRegistrationInput = z.infer<typeof finishRegistrationInputSchema>;
