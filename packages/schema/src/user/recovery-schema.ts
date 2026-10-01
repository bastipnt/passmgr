import z from "zod";
import { emailSchema } from "./email-schema";
import { recoveryWrapSchema, userKeySchema } from "./key-schema";

/**
 * Start recovery: prove possession of the recovery key and begin a new OPAQUE
 * registration for the new password.
 */
export const startRecoveryInputSchema = z.object({
  email: emailSchema,
  recoveryAuthKey: z.base64().length(44),
  registrationRequest: z.string(),
});

export const startRecoveryOutputSchema = z.object({
  attemptId: z.uuid(),
  registrationResponse: z.string(),
  recoveryKeys: recoveryWrapSchema,
});

/**
 * Finish recovery: replace the OPAQUE record and the key set (same account key,
 * new password wrap, new recovery key). Vault keys are untouched.
 */
export const finishRecoveryInputSchema = z.object({
  email: emailSchema,
  attemptId: z.uuid(),
  registrationRecord: z.string(),
  userKeys: userKeySchema,
});

/**
 * Recovery form (web + mobile). The recovery key is only trimmed here; the
 * client's `parseRecoveryKey` validates its encoding.
 */
export const recoverFormSchema = z
  .object({
    email: z.email(),
    recoveryKey: z.string().trim().min(1, "Enter your recovery key"),
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type RecoverFormValues = z.infer<typeof recoverFormSchema>;
