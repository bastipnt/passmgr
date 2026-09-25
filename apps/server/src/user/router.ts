import { db, keysTable } from "@repo/db";
import { passwordKeySchema } from "@repo/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { freshAuthProcedure, protectedProcedure } from "../auth/auth-middleware";
import { router } from "../trpc";

export const userRouter = router({
  // Lightweight liveness check. The mobile client calls this to validate a
  // restored session before entering the app; passing through
  // `protectedProcedure` also refreshes the sliding session TTL.
  heartbeat: protectedProcedure.query(() => {
    return { ok: true } as const;
  }),

  // Re-wrap the vault key under new Argon2 params. The client re-derives the
  // password KEK and re-encrypts the vault key locally (zero-knowledge — the
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
          encryptedVaultKeyRecovery: active.encryptedVaultKeyRecovery,
          vaultKeyEncryptionNonceRecovery: active.vaultKeyEncryptionNonceRecovery,
          passwordKekParams: input.passwordKekParams,
          passwordKekSalt: input.passwordKekSalt,
          encryptedVaultKey: input.encryptedVaultKey,
          vaultKeyEncryptionNonce: input.vaultKeyEncryptionNonce,
          valid_from: now,
        });
      });
    }),
});
