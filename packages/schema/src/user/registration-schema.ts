import z from "zod";
import { emailSchema } from "./email-schema";
import { userKeySchema, vaultKeyWrapSchema } from "./key-schema";

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

/**
 * Finish registration
 */
export const finishRegistrationInputSchema = z.object({
  email: emailSchema,
  registrationRecord: z.string(),
  userKeys: userKeySchema,
  // The default vault, created together with the account (first key version).
  personalVault: vaultKeyWrapSchema.extend({ keyVersion: z.literal(1) }),
  invite: z.string().max(128).optional(),
});
