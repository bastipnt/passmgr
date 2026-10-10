import { db, vaultKeyLinksTable, vaultMembersTable, vaultsTable } from "@repo/db";
import {
  createVaultInputSchema,
  deleteVaultInputSchema,
  memberVaultSchema,
  rotateVaultKeyInputSchema,
  updateVaultMetaInputSchema,
  VAULT_MANAGE_ROLES,
} from "@repo/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import z from "zod";
import { protectedProcedure } from "../auth/auth-middleware";
import { router } from "../trpc";
import { isUniqueViolation } from "../util/general";
import { lockVaults, memberVaults, notifyVaultMembers, requireVaultRole } from "./access";

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
   * Rotate a vault's key (owners and managers): the next key version, the
   * caller's wrap of it, the current key wrapped under it (so members keep
   * reading the history) and the metadata re-encrypted. From the commit on,
   * `record.push` takes puts under the new key only; the caller re-encrypts the
   * records through its outbox.
   *
   * CONFLICT when the vault isn't at `keyVersion - 1` any more (another rotation
   * won). PRECONDITION_FAILED while the vault has other members: they need the
   * new key sealed to their public key, which comes with sharing (ADR 0001 D7).
   */
  rotateKey: protectedProcedure
    .input(rotateVaultKeyInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { vaultId, keyVersion, encryptedVaultKey, vaultKeyEncryptionNonce, previousKey } =
        input;

      await db
        .transaction(async (tx) => {
          await requireVaultRole(ctx.userId, vaultId, VAULT_MANAGE_ROLES, tx);
          // Pushes to the vault wait, so none commits under the old key after this.
          await lockVaults(tx, [vaultId]);

          const others = await tx
            .select({ userId: vaultMembersTable.userId })
            .from(vaultMembersTable)
            .where(
              and(eq(vaultMembersTable.vaultId, vaultId), ne(vaultMembersTable.userId, ctx.userId)),
            )
            .limit(1);
          if (others.length > 0) throw new TRPCError({ code: "PRECONDITION_FAILED" });

          const [rotated] = await tx
            .update(vaultsTable)
            .set({
              keyVersion,
              encryptedMeta: input.encryptedMeta,
              metaEncryptionNonce: input.metaEncryptionNonce,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(vaultsTable.vaultId, vaultId),
                eq(vaultsTable.keyVersion, keyVersion - 1),
                // Deleted after the role check, before the lock: nothing left to rotate.
                isNull(vaultsTable.deleted_at),
              ),
            )
            .returning({ vaultId: vaultsTable.vaultId });
          if (!rotated) throw new TRPCError({ code: "CONFLICT" });

          await tx.insert(vaultKeyLinksTable).values({ vaultId, ...previousKey });
          await tx
            .update(vaultMembersTable)
            .set({ keyVersion, encryptedVaultKey, vaultKeyEncryptionNonce, updated_at: new Date() })
            .where(
              and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.userId, ctx.userId)),
            );
        })
        .catch((error: unknown) => {
          // A wrap that already exists elsewhere (a replayed ciphertext).
          if (!isUniqueViolation(error)) throw error;
          throw new TRPCError({ code: "CONFLICT" });
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
