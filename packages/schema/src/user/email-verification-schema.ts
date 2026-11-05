import z from "zod";

/**
 * FORBIDDEN message of sync and sharing while the account's email isn't
 * verified: the client pauses syncing instead of failing.
 */
export const EMAIL_UNVERIFIED = "email_unverified";

/**
 * BAD_REQUEST messages of `user.verifyEmail`: the code was wrong (try
 * another), or it is gone (expired, replaced or too many wrong codes): a new
 * one has to be sent.
 */
export const EMAIL_CODE_INVALID = "email_code_invalid";
export const EMAIL_CODE_EXPIRED = "email_code_expired";

/** Wrong codes one email code takes before it is burned. */
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

/** Seconds between two codes sent to one account. */
export const EMAIL_CODE_RESEND_SECONDS = 60;

export const emailCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code");

export const verifyEmailInputSchema = z.object({ code: emailCodeSchema });

export const emailVerificationStatusSchema = z.object({ verified: z.boolean() });

export type EmailVerificationStatus = z.infer<typeof emailVerificationStatusSchema>;
