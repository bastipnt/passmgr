import { hashEmail } from "@repo/crypto";
import { db, keysTable, userKeyPairsTable, usersTable } from "@repo/db";
import { passwordKeySchema, userPublicKeyInputSchema, userPublicKeySchema } from "@repo/schema";
import { toBase64 } from "@repo/util";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { freshAuthProcedure, protectedProcedure } from "../auth/auth-middleware";
import { serverKey } from "../opaque";
import { router } from "../trpc";

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
        const [active] = await tx
          .select()
          .from(keysTable)
          .where(
            and(
              eq(keysTable.userId, ctx.userId),
              isNull(keysTable.valid_to),
              isNull(keysTable.deleted_at),
            ),
          )
          .for("update");

        if (!active) throw new TRPCError({ code: "NOT_FOUND" });

        const now = new Date();
        await tx
          .update(keysTable)
          .set({ valid_to: now, updated_at: now })
          .where(eq(keysTable.keySetId, active.keySetId));

        await tx.insert(keysTable).values({
          userId: ctx.userId,
          recoveryKekSalt: active.recoveryKekSalt,
          encryptedAccountKeyRecovery: active.encryptedAccountKeyRecovery,
          accountKeyEncryptionNonceRecovery: active.accountKeyEncryptionNonceRecovery,
          recoveryVerifier: active.recoveryVerifier,
          passwordKekParams: input.passwordKekParams,
          passwordKekSalt: input.passwordKekSalt,
          encryptedAccountKey: input.encryptedAccountKey,
          accountKeyEncryptionNonce: input.accountKeyEncryptionNonce,
          valid_from: now,
        });
      });
    }),
});
