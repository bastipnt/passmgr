import z from "zod";
import { emailSchema } from "./email-schema";
import { passwordKeySchema } from "./key-schema";

/**
 * Start a password change (linked account, fresh OPAQUE login required): a new
 * OPAQUE registration for the new password. The email is the OPAQUE credential
 * identifier; the server checks it is the session user's.
 */
export const startPasswordChangeInputSchema = z.object({
  email: emailSchema,
  registrationRequest: z.string(),
});

export const startPasswordChangeOutputSchema = z.object({
  attemptId: z.uuid(),
  registrationResponse: z.string(),
});

/**
 * Finish a password change: replace the OPAQUE record and the password wrap of
 * the account key. The recovery wrap and the vault keys are untouched.
 */
export const finishPasswordChangeInputSchema = z.object({
  attemptId: z.uuid(),
  registrationRecord: z.string(),
  passwordKeys: passwordKeySchema,
});

/** Change password form (web + mobile). */
export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((v) => v.password !== v.currentPassword, {
    path: ["password"],
    message: "Choose a password you don't use yet",
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;
