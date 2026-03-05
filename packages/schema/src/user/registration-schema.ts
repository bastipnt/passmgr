import z from "zod";
import { userKeySchema } from "./key-schema";

/**
 * Start registration
 */
export const startRegistrationInputSchema = z.object({
  email: z.email(),
  registrationRequest: z.string(),
});

export const startRegistrationOutputSchema = z.object({
  registrationResponse: z.string(),
});

/**
 * Finish registration
 */
export const finishRegistrationInputSchema = z.object({
  email: z.string(),
  registrationRecord: z.string(),
  userKeys: userKeySchema,
});
