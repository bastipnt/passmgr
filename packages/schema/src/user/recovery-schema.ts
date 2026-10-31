import z from "zod";
import { emailSchema } from "./email-schema";
import { recoveryWrapSchema, userKeySchema } from "./key-schema";
import { opaqueMessageSchema } from "./opaque-schema";
import { passwordSchema } from "./password-schema";

/**
 * Start recovery: prove possession of the recovery key and begin a new OPAQUE
 * registration for the new password.
 */
export const startRecoveryInputSchema = z.object({
  email: emailSchema,
  recoveryAuthKey: z.base64().length(44),
  registrationRequest: opaqueMessageSchema,
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
  registrationRecord: opaqueMessageSchema,
  userKeys: userKeySchema,
});

/**
 * A password reset done on the device while the server was out of reach (a
 * linked profile, ADR 0001 D10 amended): what `finishRecovery` needs once
 * online. Kept encrypted under the account key (`sealedPendingRecoverySchema`).
 * `recoveryAuthKey` is the old recovery key's proof, never the key itself.
 */
export const pendingRecoverySchema = z.object({
  recoveryAuthKey: z.base64().length(44),
  userKeys: userKeySchema,
});

export const sealedPendingRecoverySchema = z.object({
  ciphertext: z.base64(),
  nonce: z.base64().length(32),
});

export type PendingRecovery = z.infer<typeof pendingRecoverySchema>;
export type SealedPendingRecovery = z.infer<typeof sealedPendingRecoverySchema>;

const passwordFields = {
  password: passwordSchema,
  confirmPassword: z.string(),
};

const passwordsMatch = {
  path: ["confirmPassword"],
  message: "Passwords do not match",
};

/**
 * Recovery form (web + mobile). The recovery key is only trimmed here; the
 * client's `parseRecoveryKey` validates its encoding.
 */
export const recoverFormSchema = z
  .object({
    email: z.email(),
    recoveryKey: z.string().trim().min(1, "Enter your recovery key"),
    ...passwordFields,
  })
  .refine((v) => v.password === v.confirmPassword, passwordsMatch);

/**
 * Recovery of a vault on this device only (`local` profile): the form has the
 * same fields, but the (hidden) email isn't checked.
 */
export const localRecoverFormSchema = z
  .object({
    email: z.string(),
    recoveryKey: z.string().trim().min(1, "Enter your recovery key"),
    ...passwordFields,
  })
  .refine((v) => v.password === v.confirmPassword, passwordsMatch);

export type RecoverFormValues = z.infer<typeof recoverFormSchema>;
