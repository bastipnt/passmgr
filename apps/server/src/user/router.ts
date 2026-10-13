import { RegistrationRequest } from "@cloudflare/opaque-ts";
import { decryptEmail, hashEmail, verifyToken } from "@repo/crypto";
import { db, deviceCredentialsTable, keysTable, userKeyPairsTable, usersTable } from "@repo/db";
import {
  backupCodesOutputSchema,
  confirmTotpInputSchema,
  deviceCredentialInputSchema,
  finishPasswordChangeInputSchema,
  type PasswordKeySchema,
  passwordKeySchema,
  registerDeviceCredentialInputSchema,
  startPasswordChangeInputSchema,
  startPasswordChangeOutputSchema,
  startTotpEnrollmentOutputSchema,
  twoFactorEmptyInputSchema,
  twoFactorStatusSchema,
  userPublicKeyInputSchema,
  userPublicKeySchema,
} from "@repo/schema";
import { fromBase64, toBase64 } from "@repo/util";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { freshAuthProcedure, protectedProcedure } from "../auth/auth-middleware";
import {
  deleteDeviceCredential,
  deleteDeviceCredentials,
  ownsDeviceCredential,
  refreshDeviceCredential,
} from "../auth/device-credentials";
import {
  disableTotp,
  enableTotp,
  hasTotp,
  newTotpEnrollment,
  regenerateBackupCodes,
  twoFactorStatus,
} from "../auth/two-factor";
import { credentialKey } from "../auth/webauthn";
import { b64ToBytes, bytesToB64, opaqueConfig, opaqueServer, serverKey } from "../opaque";
import { router } from "../trpc";
import {
  deleteTotpEnrollment,
  endDeletedUserSessions,
  getTotpEnrollment,
  linkSessionCredential,
  resetLoginThrottle,
  revokeUserSessions,
  setPasswordChangeAttempt,
  setTotpEnrollment,
  takePasswordChangeAttempt,
} from "../util/redis-utils";
import { notifyVaultMembers } from "../vault/access";
import { deleteAccount } from "./delete-account";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The user's active key set, row-locked until the transaction ends. */
async function lockActiveKeySet(tx: Tx, userId: string) {
  const [active] = await tx
    .select()
    .from(keysTable)
    .where(
      and(eq(keysTable.userId, userId), isNull(keysTable.valid_to), isNull(keysTable.deleted_at)),
    )
    .for("update");
  return active;
}

/**
 * Close the active key set and insert its successor with a new password wrap;
 * the recovery wrap + verifier carry over unchanged. Never updates key
 * material in place, so a bad change can be rolled back.
 */
async function replacePasswordWrap(
  tx: Tx,
  active: typeof keysTable.$inferSelect,
  passwordKeys: PasswordKeySchema,
  now: Date,
) {
  await tx
    .update(keysTable)
    .set({ valid_to: now, updated_at: now })
    .where(eq(keysTable.keySetId, active.keySetId));

  await tx.insert(keysTable).values({
    userId: active.userId,
    recoveryKekSalt: active.recoveryKekSalt,
    encryptedAccountKeyRecovery: active.encryptedAccountKeyRecovery,
    accountKeyEncryptionNonceRecovery: active.accountKeyEncryptionNonceRecovery,
    recoveryVerifier: active.recoveryVerifier,
    passwordKekParams: passwordKeys.passwordKekParams,
    passwordKekSalt: passwordKeys.passwordKekSalt,
    encryptedAccountKey: passwordKeys.encryptedAccountKey,
    accountKeyEncryptionNonce: passwordKeys.accountKeyEncryptionNonce,
    valid_from: now,
  });
}

/**
 * Changing an enrolled second factor: a fresh login that passed it. A session
 * from before two-factor was turned on (fresh, but without a code) can't.
 */
const secondFactorProcedure = freshAuthProcedure.use(async (opts) => {
  if (!opts.ctx.secondFactor) {
    throw new TRPCError({ code: "FORBIDDEN", message: "second factor required" });
  }
  return opts.next();
});

export const userRouter = router({
  // Lightweight liveness check. The mobile client calls this to validate a
  // restored session before entering the app; passing through
  // `protectedProcedure` also refreshes the sliding session TTL.
  heartbeat: protectedProcedure.query(() => {
    return { ok: true } as const;
  }),

  // Another user's current public key, to seal a vault key to when inviting
  // them (ADR 0001 D7). The client shows its fingerprint for out-of-band
  // verification before trusting it. Reveals to a logged-in user whether an
  // email has an account, which an invite flow can't avoid.
  publicKey: protectedProcedure
    .input(userPublicKeyInputSchema)
    .output(userPublicKeySchema)
    .query(async ({ input }) => {
      const emailHash = toBase64(await hashEmail(serverKey, input.email));
      const [found] = await db
        .select({
          keyVersion: userKeyPairsTable.keyVersion,
          publicKey: userKeyPairsTable.publicKey,
        })
        .from(userKeyPairsTable)
        .innerJoin(usersTable, eq(usersTable.userId, userKeyPairsTable.userId))
        .where(and(eq(usersTable.emailHash, emailHash), isNull(usersTable.deleted_at)))
        .orderBy(desc(userKeyPairsTable.keyVersion))
        .limit(1);

      if (!found) throw new TRPCError({ code: "NOT_FOUND" });
      return found;
    }),

  // A device credential (web biometric unlock) that logs in without the
  // password from now on. Needs a fresh password login: a stolen session must
  // not turn into lasting access. Linked to this session, so revoking it
  // removes the credential too.
  registerDeviceCredential: freshAuthProcedure
    .input(registerDeviceCredentialInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { credentialId, publicKey, algorithm } = input;
      if (!credentialKey(fromBase64(publicKey), algorithm)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "unsupported public key" });
      }
      const [inserted] = await db
        .insert(deviceCredentialsTable)
        .values({
          credentialId,
          userId: ctx.userId,
          publicKey,
          algorithm,
          deviceName: ctx.deviceName,
        })
        .onConflictDoNothing()
        .returning({ credentialId: deviceCredentialsTable.credentialId });
      if (!inserted) throw new TRPCError({ code: "CONFLICT", message: "credential exists" });
      await linkSessionCredential(ctx.sessionId, credentialId);
      ctx.req?.log.info({ algorithm }, "auth.device_credential.registered");
      return { ok: true } as const;
    }),

  // A login on a device that has a credential: note it on this session, so
  // revoking the session (or signing out the others from it) treats the
  // credential as this device's. A password login also renews it.
  linkDeviceCredential: protectedProcedure
    .input(deviceCredentialInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!(await ownsDeviceCredential(ctx.userId, input.credentialId))) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await linkSessionCredential(ctx.sessionId, input.credentialId);
      if (!ctx.passwordless) await refreshDeviceCredential(ctx.userId, input.credentialId);
      return { ok: true } as const;
    }),

  removeDeviceCredential: protectedProcedure
    .input(deviceCredentialInputSchema)
    .mutation(async ({ ctx, input }) => {
      const removed = await deleteDeviceCredential(ctx.userId, input.credentialId);
      if (removed) ctx.req?.log.info({}, "auth.device_credential.removed");
      return { ok: true } as const;
    }),

  // Re-wrap the account key under new Argon2 params. The client re-derives the
  // password KEK and re-encrypts the account key locally (zero-knowledge — the
  // server never sees the plaintext key or password).
  //
  // Requires a fresh OPAQUE login, and never overwrites: the active key set is
  // closed (valid_to) and a new version inserted with the new password-side
  // material and the unchanged recovery-KEK copy, so a bad or malicious rekey
  // can be rolled back.
  rekeyPasswordKeys: freshAuthProcedure
    .input(passwordKeySchema)
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        const active = await lockActiveKeySet(tx, ctx.userId);
        if (!active) throw new TRPCError({ code: "NOT_FOUND" });
        await replacePasswordWrap(tx, active, input, new Date());
      });
    }),

  // Change the master password of an account (ADR 0001 D10, linked mode).
  // Two steps, like a registration: a new OPAQUE registration for the new
  // password, then the swap of the OPAQUE record and the password wrap of the
  // account key (re-wrapped on the client; the recovery wrap and the vault keys
  // stay). Requires a fresh OPAQUE login with the current password; the swap
  // revokes every session, so the client logs in again with the new one.
  startPasswordChange: freshAuthProcedure
    .input(startPasswordChangeInputSchema)
    .output(startPasswordChangeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { email, registrationRequest } = input;
      // The OPAQUE credential identifier is the email: it must be this user's.
      const emailHash = toBase64(await hashEmail(serverKey, email));
      const user = await db.query.usersTable.findFirst({
        columns: { emailHash: true },
        where: { userId: ctx.userId, deleted_at: { isNull: true } },
      });
      if (user?.emailHash !== emailHash) throw new TRPCError({ code: "FORBIDDEN" });

      const keys = await db.query.keysTable.findFirst({
        columns: { keySetId: true },
        where: { userId: ctx.userId, valid_to: { isNull: true }, deleted_at: { isNull: true } },
      });
      if (!keys) throw new TRPCError({ code: "NOT_FOUND" });

      let req: RegistrationRequest;
      try {
        req = RegistrationRequest.deserialize(opaqueConfig, b64ToBytes(registrationRequest));
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "invalid registration request" });
      }

      const resp = await opaqueServer.registerInit(req, email);
      if (resp instanceof Error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "password change failed" });
      }

      const attemptId = await setPasswordChangeAttempt({
        userId: ctx.userId,
        keySetId: keys.keySetId,
      });
      return { attemptId, registrationResponse: bytesToB64(resp.serialize()) };
    }),

  finishPasswordChange: freshAuthProcedure
    .input(finishPasswordChangeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { attemptId, registrationRecord, passwordKeys } = input;
      const attempt = await takePasswordChangeAttempt(attemptId);
      if (attempt?.userId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "no password change attempt" });
      }

      const emailHash = await db.transaction(async (tx) => {
        const active = await lockActiveKeySet(tx, ctx.userId);
        // The key set changed since startPasswordChange (concurrent rekey,
        // recovery or change): the wrap may be of a key set that's gone.
        if (active?.keySetId !== attempt.keySetId) {
          throw new TRPCError({ code: "CONFLICT", message: "key set changed" });
        }

        const now = new Date();
        await replacePasswordWrap(tx, active, passwordKeys, now);
        const [user] = await tx
          .update(usersTable)
          .set({ registrationRecord, updated_at: now })
          .where(and(eq(usersTable.userId, ctx.userId), isNull(usersTable.deleted_at)))
          .returning({ emailHash: usersTable.emailHash });
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await deleteDeviceCredentials(ctx.userId, undefined, tx);
        return user.emailHash;
      });

      // This device logs in again with the new password; every other one is signed out.
      await revokeUserSessions(ctx.userId, ctx.sessionId);
      await resetLoginThrottle(emailHash);
      ctx.req?.log.info({ emailHash }, "auth.password_change.success");
      return { ok: true } as const;
    }),

  // Delete the account and everything stored for it, for good (see
  // `deleteAccount`). Requires a fresh OPAQUE login. PRECONDITION_FAILED
  // (`SOLE_OWNER`) while the user alone owns a shared vault others are in.
  // Every session ends; the other devices lock like after a sign-out.
  deleteAccount: freshAuthProcedure.mutation(async ({ ctx }) => {
    const { emailHash, leftVaultIds } = await deleteAccount(ctx.userId);
    ctx.req?.log.info({ emailHash }, "auth.account.deleted");

    // Best-effort: the account is gone, so this answers ok whatever happens
    // here. A session left behind finds no user (and expires with its TTL).
    try {
      await endDeletedUserSessions(ctx.userId, ctx.sessionId);
      await resetLoginThrottle(emailHash);
      // The members who stay: the member list changed and the key needs rotating.
      await notifyVaultMembers(...leftVaultIds);
    } catch (error) {
      ctx.req?.log.error({ err: error, emailHash }, "auth.account.deleted.cleanup_failed");
    }
    return { ok: true } as const;
  }),

  // Two-factor (TOTP + backup codes) for the server login, opt-in.
  twoFactorStatus: protectedProcedure.output(twoFactorStatusSchema).query(async ({ ctx }) => {
    return await twoFactorStatus(ctx.userId);
  }),

  // Turning it on, step 1: a new secret, kept aside until a code from the
  // authenticator app confirms it was enrolled (`confirmTotp`).
  startTotpEnrollment: freshAuthProcedure
    .input(twoFactorEmptyInputSchema)
    .output(startTotpEnrollmentOutputSchema)
    .mutation(async ({ ctx }) => {
      if (await hasTotp(ctx.userId)) {
        throw new TRPCError({ code: "CONFLICT", message: "two-factor is already on" });
      }
      const user = await db.query.usersTable.findFirst({
        columns: { encryptedEmail: true, emailNonce: true, emailEncryptionKeySalt: true },
        where: { userId: ctx.userId, deleted_at: { isNull: true } },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const email = await decryptEmail(
        serverKey,
        user.encryptedEmail,
        user.emailNonce,
        user.emailEncryptionKeySalt,
      );

      const { secret, uri } = newTotpEnrollment(email);
      await setTotpEnrollment(ctx.userId, secret);
      return { secret, uri };
    }),

  // Step 2: the first code from the app. Stores the secret and hands out the
  // backup codes, once.
  confirmTotp: freshAuthProcedure
    .input(confirmTotpInputSchema)
    .output(backupCodesOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const secret = await getTotpEnrollment(ctx.userId);
      if (!secret) throw new TRPCError({ code: "NOT_FOUND", message: "no enrollment" });
      const step = await verifyToken(secret, input.code, null);
      if (step === null) throw new TRPCError({ code: "BAD_REQUEST", message: "wrong code" });

      const backupCodes = await enableTotp(ctx.userId, secret, step);
      if (!backupCodes) {
        throw new TRPCError({ code: "CONFLICT", message: "two-factor is already on" });
      }
      await deleteTotpEnrollment(ctx.userId);
      ctx.req?.log.info({}, "auth.two_factor.enabled");
      return { backupCodes };
    }),

  // Back to password-only.
  disableTotp: secondFactorProcedure.input(twoFactorEmptyInputSchema).mutation(async ({ ctx }) => {
    await disableTotp(ctx.userId);
    ctx.req?.log.info({}, "auth.two_factor.disabled");
    return { ok: true } as const;
  }),

  // New backup codes; the old ones stop working.
  regenerateBackupCodes: secondFactorProcedure
    .input(twoFactorEmptyInputSchema)
    .output(backupCodesOutputSchema)
    .mutation(async ({ ctx }) => {
      const backupCodes = await regenerateBackupCodes(ctx.userId);
      if (!backupCodes) throw new TRPCError({ code: "NOT_FOUND", message: "two-factor is off" });
      return { backupCodes };
    }),
});
