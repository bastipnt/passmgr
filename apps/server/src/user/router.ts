import { RegistrationRequest } from "@cloudflare/opaque-ts";
import { hashEmail } from "@repo/crypto";
import { db, keysTable, userKeyPairsTable, usersTable } from "@repo/db";
import {
  finishPasswordChangeInputSchema,
  type PasswordKeySchema,
  passwordKeySchema,
  startPasswordChangeInputSchema,
  startPasswordChangeOutputSchema,
  userPublicKeyInputSchema,
  userPublicKeySchema,
} from "@repo/schema";
import { toBase64 } from "@repo/util";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { freshAuthProcedure, protectedProcedure } from "../auth/auth-middleware";
import { b64ToBytes, bytesToB64, opaqueConfig, opaqueServer, serverKey } from "../opaque";
import { router } from "../trpc";
import {
  resetLoginThrottle,
  revokeUserSessions,
  setPasswordChangeAttempt,
  takePasswordChangeAttempt,
} from "../util/redis-utils";

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
        return user.emailHash;
      });

      await revokeUserSessions(ctx.userId);
      await resetLoginThrottle(emailHash);
      ctx.req?.log.info({ emailHash }, "auth.password_change.success");
      return { ok: true } as const;
    }),
});
