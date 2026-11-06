import { randomInt } from "node:crypto";
import { decryptEmail } from "@repo/crypto";
import { db, usersTable } from "@repo/db";
import { EMAIL_CODE_EXPIRED, EMAIL_CODE_INVALID, EMAIL_UNVERIFIED } from "@repo/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, lt } from "drizzle-orm";
import { getMailer } from "../mail/mailer";
import { recordEmailVerification, recordRateLimited } from "../metrics";
import { serverKey } from "../opaque";
import {
  checkEmailCode,
  claimEmailCodeSend,
  deleteEmailCodes,
  endDeletedUserSessions,
  resetLoginThrottle,
  setEmailCode,
} from "../util/redis-utils";
import { deleteAccount } from "./delete-account";

/** Accounts still unverified this long after registering are deleted (`purgeUnverifiedAccounts`). */
export const UNVERIFIED_ACCOUNT_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export function emailVerificationEnabled(): boolean {
  return getMailer() !== null;
}

/** `emailVerifiedAt` for a new account: now when there is no mailer to verify it with. */
export function initialEmailVerifiedAt(): Date | null {
  return emailVerificationEnabled() ? null : new Date();
}

/**
 * Always with the mailer turned off: accounts made while it was on couldn't
 * verify any more.
 */
export async function isEmailVerified(userId: string): Promise<boolean> {
  if (!emailVerificationEnabled()) return true;
  const [user] = await db
    .select({ emailVerifiedAt: usersTable.emailVerifiedAt })
    .from(usersTable)
    .where(eq(usersTable.userId, userId));
  return user?.emailVerifiedAt != null;
}

/** FORBIDDEN (`EMAIL_UNVERIFIED`) until the user's email is verified. */
export async function requireVerifiedEmail(userId: string): Promise<void> {
  if (!(await isEmailVerified(userId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: EMAIL_UNVERIFIED });
  }
}

/**
 * Mail a new 6-digit code to the user's address (replacing an earlier one).
 * TOO_MANY_REQUESTS within the resend interval or past the hourly cap;
 * PRECONDITION_FAILED when verification is off or the email is verified already.
 */
export async function sendVerificationCode(userId: string): Promise<void> {
  const mailer = getMailer();
  if (!mailer) throw new TRPCError({ code: "PRECONDITION_FAILED" });

  const [user] = await db
    .select({
      encryptedEmail: usersTable.encryptedEmail,
      emailNonce: usersTable.emailNonce,
      emailEncryptionKeySalt: usersTable.emailEncryptionKeySalt,
      emailVerifiedAt: usersTable.emailVerifiedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.userId, userId));
  if (!user) throw new TRPCError({ code: "NOT_FOUND" });
  if (user.emailVerifiedAt) throw new TRPCError({ code: "PRECONDITION_FAILED" });

  if (!(await claimEmailCodeSend(userId))) {
    recordRateLimited("email_code");
    throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await setEmailCode(userId, code);
  const email = await decryptEmail(
    serverKey,
    user.encryptedEmail,
    user.emailNonce,
    user.emailEncryptionKeySalt,
  );
  try {
    await mailer.send({
      to: email,
      subject: `${code} is your passmgr verification code`,
      text: `Enter this code in passmgr to verify your email address:\n\n${code}\n\nIt expires in 15 minutes. If you didn't create a passmgr account, ignore this email: the account is deleted after 7 days.`,
    });
  } catch (err) {
    recordEmailVerification("code_send_failed");
    throw err;
  }
  recordEmailVerification("code_sent");
}

/** Verify the user's email with a code from `sendVerificationCode`. */
export async function verifyEmail(userId: string, code: string): Promise<void> {
  if (await isEmailVerified(userId)) return;

  const result = await checkEmailCode(userId, code);
  if (result === "invalid") {
    recordEmailVerification("code_invalid");
    throw new TRPCError({ code: "BAD_REQUEST", message: EMAIL_CODE_INVALID });
  }
  if (result === "expired") {
    recordEmailVerification("code_expired");
    throw new TRPCError({ code: "BAD_REQUEST", message: EMAIL_CODE_EXPIRED });
  }

  await db
    .update(usersTable)
    .set({ emailVerifiedAt: new Date() })
    .where(and(eq(usersTable.userId, userId), isNull(usersTable.emailVerifiedAt)));
  await deleteEmailCodes(userId);
  recordEmailVerification("verified");
}

/**
 * Delete every account still unverified UNVERIFIED_ACCOUNT_MAX_AGE_MS after it
 * was created, so nobody holds an address they don't own. Such an account
 * never synced or shared, so the server loses nothing its owner's device
 * doesn't still have. One that fails (verified meanwhile, deleted by another
 * instance) is skipped until the next run. Nothing goes while the mailer is
 * off: those accounts couldn't have verified.
 */
export async function purgeUnverifiedAccounts(
  now = Date.now(),
): Promise<{ purged: number; failed: number }> {
  if (!emailVerificationEnabled()) return { purged: 0, failed: 0 };
  const stale = await db
    .select({ userId: usersTable.userId })
    .from(usersTable)
    .where(
      and(
        isNull(usersTable.emailVerifiedAt),
        lt(usersTable.created_at, new Date(now - UNVERIFIED_ACCOUNT_MAX_AGE_MS)),
      ),
    );

  let purged = 0;
  let failed = 0;
  for (const { userId } of stale) {
    try {
      if (await isEmailVerified(userId)) continue;
      const { emailHash } = await deleteAccount(userId);
      await endDeletedUserSessions(userId);
      await resetLoginThrottle(emailHash);
      await deleteEmailCodes(userId);
      purged++;
    } catch {
      failed++;
    }
  }
  return { purged, failed };
}
