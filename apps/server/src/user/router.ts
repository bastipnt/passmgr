import { db, keysTable } from "@repo/db";
import { passwordKeySchema } from "@repo/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { protectedProcedure } from "../auth/auth-middleware";
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
  // server never sees the plaintext key or password). Only the password-side
  // material is replaced; the recovery-KEK copy of the vault key is untouched.
  rekeyPasswordKeys: protectedProcedure
    .input(passwordKeySchema)
    .mutation(async ({ ctx, input }) => {
      const result = await db
        .update(keysTable)
        .set({
          passwordKekParams: input.passwordKekParams,
          passwordKekSalt: input.passwordKekSalt,
          encryptedVaultKey: input.encryptedVaultKey,
          vaultKeyEncryptionNonce: input.vaultKeyEncryptionNonce,
        })
        .where(
          and(
            eq(keysTable.userId, ctx.userId),
            isNull(keysTable.valid_to),
            isNull(keysTable.deleted_at),
          ),
        )
        .returning({ keySetId: keysTable.keySetId });

      if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
    }),
});
