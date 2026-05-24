import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { loggedProcedure } from "../logger";
import { protectedProcedure } from "../auth/auth-middleware";
import { passwordKeySchema } from "@repo/schema";
import { db, keysTable } from "@repo/db";
import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

type User = {
  id: string;
  name: string;
  bio?: string;
};

const users: Record<string, User> = {};

export const userRouter = router({
  all: loggedProcedure.query(() => {
    return {
      message: "Hello there",
    };
  }),
  getById: publicProcedure.input(z.string()).query((opts) => {
    return users[opts.input]; // input type is string
  }),
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(3),
        bio: z.string().max(142).optional(),
      }),
    )
    .mutation((opts) => {
      const id = Date.now().toString();
      const user: User = { id, ...opts.input };
      users[user.id] = user;
      return user;
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
