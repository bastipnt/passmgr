import { db, usersTable, vaultKeyLinksTable, vaultMembersTable, vaultsTable } from "@repo/db";
import {
  createVaultInputSchema,
  deleteVaultInputSchema,
  MAX_VAULTS_PER_USER,
  memberVaultSchema,
  rotateVaultKeyInputSchema,
  updateVaultMetaInputSchema,
  VAULT_MANAGE_ROLES,
} from "@repo/schema";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import z from "zod";
import { verifiedProcedure } from "../auth/auth-middleware";
import { emitRecordsChanged } from "../events/record-events";
import { router } from "../trpc";
import { isUniqueViolation } from "../util/general";
import {
  currentKeyPairVersions,
  lockVaults,
  memberVaults,
  notifyVaultMembers,
  requireVaultRole,
} from "./access";
import { sharingProcedures } from "./sharing";

export const vaultRouter = router({
  ...sharingProcedures,

  /** Every vault the user can access (also part of every `record.sync`). */
  list: verifiedProcedure.output(z.array(memberVaultSchema)).query(async ({ ctx }) => {
    return await memberVaults(ctx.userId);
  }),

  /**
   * A new vault next to the personal one, owned by the caller. The client
   * generated its id and key and wrapped the key under its account key.
   * PRECONDITION_FAILED once they own `MAX_VAULTS_PER_USER`.
   */
  create: verifiedProcedure.input(createVaultInputSchema).mutation(async ({ ctx, input }) => {
    const { vaultId, encryptedMeta, metaEncryptionNonce, ...vaultKey } = input;

    await db
      .transaction(async (tx) => {
        // Concurrent creates queue up here, so they can't all pass the count.
        // NO KEY UPDATE, as in `deleteAccount`: record inserts' FK checks don't wait.
        await tx
          .select({ userId: usersTable.userId })
          .from(usersTable)
          .where(eq(usersTable.userId, ctx.userId))
          .for("no key update");
        const [owned] = await tx
          .select({ vaults: count() })
          .from(vaultsTable)
          .where(eq(vaultsTable.ownerId, ctx.userId));
        if ((owned?.vaults ?? 0) >= MAX_VAULTS_PER_USER) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "too many vaults" });
        }

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
  updateMeta: verifiedProcedure
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
   * Rotate a vault's key (owners and managers holding its current key): the
   * next key version, the caller's wrap of it, the current key wrapped under it
   * (so members keep reading the history), the metadata re-encrypted, and the
   * new key sealed to every other member and invitee from the caller's keypair
   * (each accepts it with `acceptKey`). From the commit on, `record.push`
   * takes puts under the new key only; the caller re-encrypts the records
   * through its outbox. Clears `keyRotationNeeded`.
   *
   * CONFLICT when the vault isn't at `keyVersion - 1` any more (another rotation
   * won) or the caller doesn't hold that key yet. PRECONDITION_FAILED when
   * `memberKeys` aren't exactly the other members, each sealed to their current
   * public key, or the caller's keypair isn't the current one: the members
   * changed, so the caller fetches them again (`members`) and retries.
   */
  rotateKey: verifiedProcedure.input(rotateVaultKeyInputSchema).mutation(async ({ ctx, input }) => {
    const { vaultId, keyVersion, encryptedVaultKey, vaultKeyEncryptionNonce, previousKey } = input;

    await db
      .transaction(async (tx) => {
        await requireVaultRole(ctx.userId, vaultId, VAULT_MANAGE_ROLES, tx);
        // Pushes, invites and member changes wait, so none sees the old key after this.
        await lockVaults(tx, [vaultId]);

        const members = await tx
          .select({ userId: vaultMembersTable.userId, keyVersion: vaultMembersTable.keyVersion })
          .from(vaultMembersTable)
          .where(eq(vaultMembersTable.vaultId, vaultId));
        // Its link must wrap the key being replaced, not an older one it still holds.
        const own = members.find((m) => m.userId === ctx.userId);
        if (own?.keyVersion !== keyVersion - 1) throw new TRPCError({ code: "CONFLICT" });

        const others = members.filter((m) => m.userId !== ctx.userId).map((m) => m.userId);
        const seals = new Map(input.memberKeys.map((seal) => [seal.userId, seal]));
        const keyPairs = await currentKeyPairVersions(tx, [ctx.userId, ...others]);
        // Exactly the other members, each sealed to their current keypair.
        const sealedTo = (userId: string) => {
          const version = keyPairs.get(userId);
          return version !== undefined && seals.get(userId)?.recipientKeyVersion === version;
        };
        if (
          seals.size !== others.length ||
          !others.every(sealedTo) ||
          keyPairs.get(ctx.userId) !== input.senderKeyVersion
        ) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "members changed" });
        }

        const now = new Date();
        const [rotated] = await tx
          .update(vaultsTable)
          .set({
            keyVersion,
            keyRotationNeeded: false,
            encryptedMeta: input.encryptedMeta,
            metaEncryptionNonce: input.metaEncryptionNonce,
            updated_at: now,
          })
          .where(and(eq(vaultsTable.vaultId, vaultId), eq(vaultsTable.keyVersion, keyVersion - 1)))
          .returning({ vaultId: vaultsTable.vaultId });
        if (!rotated) throw new TRPCError({ code: "CONFLICT" });

        await tx.insert(vaultKeyLinksTable).values({ vaultId, ...previousKey });
        await tx
          .update(vaultMembersTable)
          .set({ keyVersion, encryptedVaultKey, vaultKeyEncryptionNonce, updated_at: now })
          .where(
            and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.userId, ctx.userId)),
          );
        for (const seal of input.memberKeys) {
          const sealed = {
            sealedVaultKey: seal.sealedVaultKey,
            sealedKeyVersion: keyVersion,
            sealedToKeyVersion: seal.recipientKeyVersion,
            sealedByUserId: ctx.userId,
            sealedByKeyVersion: input.senderKeyVersion,
            updated_at: now,
          };
          const member = and(
            eq(vaultMembersTable.vaultId, vaultId),
            eq(vaultMembersTable.userId, seal.userId),
          );
          // An active member keeps their wrap of the old key until they accept the new one;
          // an invitee has only the sealed key, which is now this one.
          await tx
            .update(vaultMembersTable)
            .set(sealed)
            .where(and(member, eq(vaultMembersTable.status, "active")));
          await tx
            .update(vaultMembersTable)
            .set({ ...sealed, keyVersion })
            .where(and(member, eq(vaultMembersTable.status, "pending")));
        }
      })
      .catch((error: unknown) => {
        // A wrap that already exists elsewhere (a replayed ciphertext).
        if (!isUniqueViolation(error)) throw error;
        throw new TRPCError({ code: "CONFLICT" });
      });

    await notifyVaultMembers(vaultId);
  }),

  /**
   * Delete a vault for good (owners only, never the personal one): its
   * records, history, key links, members and invites go with it, and so does
   * what it counted against the owner's quota. The next sync of each member
   * drops it and its records from their devices.
   */
  delete: verifiedProcedure.input(deleteVaultInputSchema).mutation(async ({ ctx, input }) => {
    const { vaultId } = input;

    const members = await db.transaction(async (tx) => {
      // Before the role check, so a concurrent demotion or transfer can't slip in between.
      // A push to it finishes first, or finds it gone.
      await lockVaults(tx, [vaultId]);
      await requireVaultRole(ctx.userId, vaultId, ["owner"], tx);
      const members = await tx
        .select({ userId: vaultMembersTable.userId })
        .from(vaultMembersTable)
        .where(eq(vaultMembersTable.vaultId, vaultId));
      const [deleted] = await tx
        .delete(vaultsTable)
        .where(and(eq(vaultsTable.vaultId, vaultId), eq(vaultsTable.kind, "shared")))
        .returning({ vaultId: vaultsTable.vaultId });
      // The personal vault: every account keeps exactly one.
      if (!deleted) throw new TRPCError({ code: "FORBIDDEN" });
      return members;
    });

    for (const { userId } of members) emitRecordsChanged(userId);
  }),
});
