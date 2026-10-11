import z from "zod";

/**
 * UNAUTHORIZED messages of `login.verifySecondFactor`: the code was wrong (try
 * another), or the challenge is gone (expired, used, or too many wrong codes):
 * the login starts over with the password.
 */
export const SECOND_FACTOR_INVALID = "second_factor_invalid";
export const SECOND_FACTOR_EXPIRED = "second_factor_expired";

/** Wrong codes one login challenge takes before it is burned. */
export const SECOND_FACTOR_MAX_ATTEMPTS = 5;

/** Backup codes handed out per enrollment / regeneration. */
export const BACKUP_CODE_COUNT = 10;

const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code");

export const twoFactorStatusSchema = z.object({
  enabled: z.boolean(),
  // Unused backup codes (0 when off).
  backupCodesLeft: z.number().int(),
});

export type TwoFactorStatus = z.infer<typeof twoFactorStatusSchema>;

export const startTotpEnrollmentOutputSchema = z.object({
  // For the QR code / a link into the authenticator app.
  uri: z.string(),
  // Base32, for typing into the app by hand.
  secret: z.string(),
});

export const confirmTotpInputSchema = z.object({ code: totpCodeSchema });

/** Shown once: the server keeps only their hashes. */
export const backupCodesOutputSchema = z.object({ backupCodes: z.array(z.string()) });

/** Same as `logoutInputSchema`: clients send `{}` (a POST needs a body). */
export const twoFactorEmptyInputSchema = z.object({}).strict().optional();

/** Form: the code from the authenticator app, to finish turning two-factor on. */
export const totpConfirmFormSchema = z.object({ code: totpCodeSchema });

export type TotpConfirmFormValues = z.infer<typeof totpConfirmFormSchema>;

/** Form: the second login step (a TOTP code or a backup code). */
export const secondFactorFormSchema = z.object({
  code: z.string().trim().min(1, "Enter a code").max(32),
});

export type SecondFactorFormValues = z.infer<typeof secondFactorFormSchema>;

/** Form: the master password a two-factor change starts with (a fresh login). */
export const twoFactorPasswordFormSchema = z.object({
  password: z.string().min(1, "Enter your master password"),
});

export type TwoFactorPasswordFormValues = z.infer<typeof twoFactorPasswordFormSchema>;
