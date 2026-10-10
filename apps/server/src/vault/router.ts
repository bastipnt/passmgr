import { db, vaultMembersTable, vaultsTable } from "@repo/db";
import {
  createVaultInputSchema,
  deleteVaultInputSchema,
  memberVaultSchema,
  updateVaultMetaInputSchema,
  VAULT_MANAGE_ROLES,
} from "@repo/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import z from "zod";
import { protectedProcedure } from "../auth/auth-middleware";
import { router } from "../trpc";
import { isUniqueViolation } from "../util/general";
import { memberVaults, notifyVaultMembers, requireVaultRole } from "./access";

export const vaultRouter = router({
  /** Every vault the user can access (also part of every `record.sync`). */
  list: protectedProcedure.output(z.array(memberVaultSchema)).query(async ({ ctx }) => {
    return await memberVaults(ctx.userId);
  }),

  /**
   * A new vault next to the personal one, owned by the caller. The client
   * generated its id and key and wrapped the key under its account key.
   */
  create: protectedProcedure.input(createVaultInputSchema).mutation(async ({ ctx, input }) => {
    const { vaultId, encryptedMeta, metaEncryptionNonce, ...vaultKey } = input;

    await db
      .transaction(async (tx) => {
        await tx.insert(vaultsTable).values({
          vaultId,
          ownerId: ctx.userId,
          kind: "shared",
          encryptedMeta,
          metaEncryptionNonce,
        });
        await tx
          .insert(vaultMembersTable)
          .values({ vaultId, ...vaultKey, userId: ctx.userId, role: "owner" });
      })
      .catch((error: unknown) => {
        // A client-chosen vaultId (or wrap) that already exists.
        if (!isUniqueViolation(error)) throw error;
        throw new TRPCError({ code: "CONFLICT" });
      });

    await notifyVaultMembers(vaultId);
  }),

  /** Replace the encrypted name / icon / colour. Owners and managers only. */
  updateMeta: protectedProcedure
    .input(updateVaultMetaInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { vaultId, encryptedMeta, metaEncryptionNonce } = input;

      await db.transaction(async (tx) => {
        await requireVaultRole(ctx.userId, vaultId, VAULT_MANAGE_ROLES, tx);
        await tx
          .update(vaultsTable)
          .set({ encryptedMeta, metaEncryptionNonce, updated_at: new Date() })
          .where(eq(vaultsTable.vaultId, vaultId));
      });

      await notifyVaultMembers(vaultId);
    }),

  /**
   * Delete a vault (owners only, never the personal one): it leaves every
   * member's list, so the next sync drops it and its records from their
   * devices. The rows stay (`deleted_at`) until account deletion purges them.
   */
  delete: protectedProcedure.input(deleteVaultInputSchema).mutation(async ({ ctx, input }) => {
    const { vaultId } = input;

    await db.transaction(async (tx) => {
      await requireVaultRole(ctx.userId, vaultId, ["owner"], tx);
      const [deleted] = await tx
        .update(vaultsTable)
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where(and(eq(vaultsTable.vaultId, vaultId), eq(vaultsTable.kind, "shared")))
        .returning({ vaultId: vaultsTable.vaultId });
      // The personal vault: every account keeps exactly one.
      if (!deleted) throw new TRPCError({ code: "FORBIDDEN" });
    });

    await notifyVaultMembers(vaultId);
  }),
});
