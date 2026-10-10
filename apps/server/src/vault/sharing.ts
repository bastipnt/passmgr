import { decryptEmail, hashEmail } from "@repo/crypto";
import { db, userKeyPairsTable, usersTable, vaultMembersTable, vaultsTable } from "@repo/db";
import {
  acceptVaultKeyInputSchema,
  canAssignRole,
  inviteMemberInputSchema,
  MAX_VAULT_MEMBERS,
  setMemberRoleInputSchema,
  VAULT_MANAGE_ROLES,
  type VaultInvitation,
  type VaultMember,
  vaultIdInputSchema,
  vaultInvitationSchema,
  vaultMemberInputSchema,
  vaultMemberSchema,
  vaultRoleSchema,
} from "@repo/schema";
import { toBase64 } from "@repo/util";
import { TRPCError } from "@trpc/server";
import { and, count, eq, isNull, ne } from "drizzle-orm";
import z from "zod";
import { protectedProcedure } from "../auth/auth-middleware";
import { emitRecordsChanged } from "../events/record-events";
import { serverKey } from "../opaque";
import { isUniqueViolation } from "../util/general";
import {
  currentKeyPairVersions,
  currentPublicKeys,
  type DbExecutor,
  lockVaults,
  notifyVaultMembers,
  requireVaultRole,
} from "./access";

/*
 * Sharing a vault (ADR 0001 D7): invites, accepting a key sealed to the user,
 * members and their roles, leaving and removal. The vault key never reaches
 * the server: an invite carries it sealed to the invitee's public key, which
 * their device turns into its own wrap (`acceptKey`).
 *
 * Whoever leaves or is removed still knows the current key, so the vault is
 * marked `keyRotationNeeded`: the next owner or manager online rotates it
 * (`rotationsDue` in `record.sync`, `vault.rotateKey` clears it).
 */

const ANY_ROLE = vaultRoleSchema.options;

/** The caller's membership row of a live vault, any status; NOT_FOUND without one. */
async function ownMembership(tx: DbExecutor, userId: string, vaultId: string) {
  const [row] = await tx
    .select({
      role: vaultMembersTable.role,
      status: vaultMembersTable.status,
      keyVersion: vaultMembersTable.keyVersion,
      sealedKeyVersion: vaultMembersTable.sealedKeyVersion,
      kind: vaultsTable.kind,
      vaultKeyVersion: vaultsTable.keyVersion,
    })
    .from(vaultMembersTable)
    .innerJoin(vaultsTable, eq(vaultsTable.vaultId, vaultMembersTable.vaultId))
    .where(
      and(
        eq(vaultMembersTable.vaultId, vaultId),
        eq(vaultMembersTable.userId, userId),
        isNull(vaultsTable.deleted_at),
      ),
    );
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}

/** Another member's row (active or pending); NOT_FOUND when they aren't one. */
async function memberRow(tx: DbExecutor, vaultId: string, userId: string) {
  const [row] = await tx
    .select({ role: vaultMembersTable.role, status: vaultMembersTable.status })
    .from(vaultMembersTable)
    .where(and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.userId, userId)));
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}

/** How many active owners the vault has (an invite to own it doesn't count). */
async function activeOwners(tx: DbExecutor, vaultId: string): Promise<number> {
  const [row] = await tx
    .select({ owners: count() })
    .from(vaultMembersTable)
    .where(
      and(
        eq(vaultMembersTable.vaultId, vaultId),
        eq(vaultMembersTable.role, "owner"),
        eq(vaultMembersTable.status, "active"),
      ),
    );
  return row?.owners ?? 0;
}

/** Someone who knows the current key lost access: the next manager online rotates it. */
async function requireRotation(tx: DbExecutor, vaultId: string) {
  await tx
    .update(vaultsTable)
    .set({ keyRotationNeeded: true, updated_at: new Date() })
    .where(eq(vaultsTable.vaultId, vaultId));
}

async function emailOf(user: {
  encryptedEmail: string;
  emailNonce: string;
  emailEncryptionKeySalt: string;
}): Promise<string> {
  return await decryptEmail(
    serverKey,
    user.encryptedEmail,
    user.emailNonce,
    user.emailEncryptionKeySalt,
  );
}

export const sharingProcedures = {
  /**
   * Invite a user by email (owners and managers; never into the personal
   * vault): the vault's current key sealed to the invitee's current public key
   * from the inviter's. Nobody can give a role above their own (only owners
   * make owners). The invitee sees it in `invitations` until they accept or
   * decline.
   *
   * NOT_FOUND for an email without an account (as `user.publicKey` tells).
   * CONFLICT when they are a member already, or the vault was rotated since the
   * key was sealed. PRECONDITION_FAILED when either keypair isn't the current
   * one any more, or the vault is full.
   */
  invite: protectedProcedure.input(inviteMemberInputSchema).mutation(async ({ ctx, input }) => {
    const { vaultId, role } = input;
    const emailHash = toBase64(await hashEmail(serverKey, input.email));

    const inviteeId = await db
      .transaction(async (tx) => {
        const own = await ownMembership(tx, ctx.userId, vaultId);
        if (own.status !== "active") throw new TRPCError({ code: "NOT_FOUND" });
        if (!canAssignRole(own.role, "manage") || !canAssignRole(own.role, role)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        // The personal vault is every account's own (it is their default vault).
        if (own.kind !== "shared") throw new TRPCError({ code: "FORBIDDEN" });

        // A rotation waits for this, and this sees the key it left.
        await lockVaults(tx, [vaultId]);
        const [vault] = await tx
          .select({ keyVersion: vaultsTable.keyVersion })
          .from(vaultsTable)
          .where(eq(vaultsTable.vaultId, vaultId));
        if (vault?.keyVersion !== input.keyVersion) throw new TRPCError({ code: "CONFLICT" });

        const [invitee] = await tx
          .select({ userId: usersTable.userId })
          .from(usersTable)
          .where(and(eq(usersTable.emailHash, emailHash), isNull(usersTable.deleted_at)));
        if (!invitee) throw new TRPCError({ code: "NOT_FOUND" });
        if (invitee.userId === ctx.userId) throw new TRPCError({ code: "BAD_REQUEST" });

        const keyPairs = await currentKeyPairVersions(tx, [invitee.userId, ctx.userId]);
        if (
          keyPairs.get(invitee.userId) !== input.recipientKeyVersion ||
          keyPairs.get(ctx.userId) !== input.senderKeyVersion
        ) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "keypair changed" });
        }

        const [members] = await tx
          .select({ members: count() })
          .from(vaultMembersTable)
          .where(eq(vaultMembersTable.vaultId, vaultId));
        if ((members?.members ?? 0) >= MAX_VAULT_MEMBERS) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "vault is full" });
        }

        await tx.insert(vaultMembersTable).values({
          vaultId,
          userId: invitee.userId,
          role,
          status: "pending",
          keyVersion: input.keyVersion,
          sealedVaultKey: input.sealedVaultKey,
          sealedKeyVersion: input.keyVersion,
          sealedToKeyVersion: input.recipientKeyVersion,
          sealedByUserId: ctx.userId,
          sealedByKeyVersion: input.senderKeyVersion,
        });
        return invitee.userId;
      })
      .catch((error: unknown) => {
        // Already a member or invited (or a replayed box).
        if (!isUniqueViolation(error)) throw error;
        throw new TRPCError({ code: "CONFLICT" });
      });

    emitRecordsChanged(inviteeId);
    await notifyVaultMembers(vaultId);
  }),

  /**
   * The caller's pending invites, with the key sealed to them, who sealed it
   * (their public key and email: the invitee compares the fingerprint out of
   * band before accepting) and the vault's metadata (it opens with the key).
   */
  invitations: protectedProcedure.output(z.array(vaultInvitationSchema)).query(async ({ ctx }) => {
    const rows = await db
      .select({
        vaultId: vaultMembersTable.vaultId,
        role: vaultMembersTable.role,
        keyVersion: vaultMembersTable.sealedKeyVersion,
        sealedVaultKey: vaultMembersTable.sealedVaultKey,
        recipientKeyVersion: vaultMembersTable.sealedToKeyVersion,
        encryptedMeta: vaultsTable.encryptedMeta,
        metaEncryptionNonce: vaultsTable.metaEncryptionNonce,
        senderUserId: usersTable.userId,
        encryptedEmail: usersTable.encryptedEmail,
        emailNonce: usersTable.emailNonce,
        emailEncryptionKeySalt: usersTable.emailEncryptionKeySalt,
        senderKeyVersion: userKeyPairsTable.keyVersion,
        senderPublicKey: userKeyPairsTable.publicKey,
      })
      .from(vaultMembersTable)
      .innerJoin(vaultsTable, eq(vaultsTable.vaultId, vaultMembersTable.vaultId))
      .innerJoin(usersTable, eq(usersTable.userId, vaultMembersTable.sealedByUserId))
      .innerJoin(
        userKeyPairsTable,
        and(
          eq(userKeyPairsTable.userId, vaultMembersTable.sealedByUserId),
          eq(userKeyPairsTable.keyVersion, vaultMembersTable.sealedByKeyVersion),
        ),
      )
      .where(
        and(
          eq(vaultMembersTable.userId, ctx.userId),
          eq(vaultMembersTable.status, "pending"),
          isNull(vaultsTable.deleted_at),
          isNull(usersTable.deleted_at),
        ),
      );

    const invitations: VaultInvitation[] = [];
    for (const row of rows) {
      const { keyVersion, sealedVaultKey, recipientKeyVersion } = row;
      if (keyVersion === null || sealedVaultKey === null || recipientKeyVersion === null) continue;
      invitations.push({
        vaultId: row.vaultId,
        role: row.role,
        keyVersion,
        sealedVaultKey,
        recipientKeyVersion,
        encryptedMeta: row.encryptedMeta,
        metaEncryptionNonce: row.metaEncryptionNonce,
        sender: {
          userId: row.senderUserId,
          keyVersion: row.senderKeyVersion,
          publicKey: row.senderPublicKey,
          email: await emailOf(row),
        },
      });
    }
    return invitations;
  }),

  /**
   * Store the caller's own wrap of the key sealed to them: accepts an invite
   * (the membership becomes active) or a key a rotation by someone else
   * brought. CONFLICT when the key sealed to them is another version by now
   * (rotated again): they open the newer one instead.
   */
  acceptKey: protectedProcedure
    .input(acceptVaultKeyInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { vaultId, keyVersion, encryptedVaultKey, vaultKeyEncryptionNonce } = input;

      await db
        .transaction(async (tx) => {
          await ownMembership(tx, ctx.userId, vaultId);
          const [accepted] = await tx
            .update(vaultMembersTable)
            .set({
              status: "active",
              keyVersion,
              encryptedVaultKey,
              vaultKeyEncryptionNonce,
              sealedVaultKey: null,
              sealedKeyVersion: null,
              sealedToKeyVersion: null,
              sealedByUserId: null,
              sealedByKeyVersion: null,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(vaultMembersTable.vaultId, vaultId),
                eq(vaultMembersTable.userId, ctx.userId),
                // Not this version (resealed meanwhile, or nothing sealed): nothing to accept.
                eq(vaultMembersTable.sealedKeyVersion, keyVersion),
              ),
            )
            .returning({ vaultId: vaultMembersTable.vaultId });
          if (!accepted) throw new TRPCError({ code: "CONFLICT" });
        })
        .catch((error: unknown) => {
          if (!isUniqueViolation(error)) throw error;
          throw new TRPCError({ code: "CONFLICT" });
        });

      await notifyVaultMembers(vaultId);
    }),

  /**
   * Turn down an invite. The invitee could have opened the key, so the vault
   * is marked for a rotation like after a removal.
   */
  declineInvite: protectedProcedure.input(vaultIdInputSchema).mutation(async ({ ctx, input }) => {
    const { vaultId } = input;
    await db.transaction(async (tx) => {
      const own = await ownMembership(tx, ctx.userId, vaultId);
      if (own.status !== "pending") throw new TRPCError({ code: "NOT_FOUND" });
      await tx
        .delete(vaultMembersTable)
        .where(
          and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.userId, ctx.userId)),
        );
      await requireRotation(tx, vaultId);
    });
    await notifyVaultMembers(vaultId);
  }),

  /**
   * The vault's members and invitees (any member may see them), with each
   * one's current public key: a rotation seals the new key to every one of
   * them, and members compare fingerprints out of band.
   */
  members: protectedProcedure
    .input(vaultIdInputSchema)
    .output(z.array(vaultMemberSchema))
    .query(async ({ ctx, input }) => {
      await requireVaultRole(ctx.userId, input.vaultId, ANY_ROLE);
      const rows = await db
        .select({
          userId: vaultMembersTable.userId,
          role: vaultMembersTable.role,
          status: vaultMembersTable.status,
          encryptedEmail: usersTable.encryptedEmail,
          emailNonce: usersTable.emailNonce,
          emailEncryptionKeySalt: usersTable.emailEncryptionKeySalt,
        })
        .from(vaultMembersTable)
        .innerJoin(usersTable, eq(usersTable.userId, vaultMembersTable.userId))
        .where(eq(vaultMembersTable.vaultId, input.vaultId));
      const keys = await currentPublicKeys(
        db,
        rows.map((r) => r.userId),
      );

      const members: VaultMember[] = [];
      for (const row of rows) {
        const publicKey = keys.get(row.userId);
        if (!publicKey) continue;
        members.push({
          userId: row.userId,
          email: await emailOf(row),
          role: row.role,
          status: row.status,
          publicKey,
        });
      }
      return members;
    }),

  /**
   * Change a member's (or invitee's) role. Owners and managers, and only
   * between roles they could give (`canAssignRole`): a manager can't touch an
   * owner or make one. PRECONDITION_FAILED when it would leave no owner.
   */
  setMemberRole: protectedProcedure
    .input(setMemberRoleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { vaultId, userId, role } = input;
      await db.transaction(async (tx) => {
        const actor = await requireVaultRole(ctx.userId, vaultId, VAULT_MANAGE_ROLES, tx);
        // Owner changes queue up, so two demotions can't both see another owner left.
        await lockVaults(tx, [vaultId]);
        const target = await memberRow(tx, vaultId, userId);
        if (!canAssignRole(actor, target.role) || !canAssignRole(actor, role)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (
          target.role === "owner" &&
          target.status === "active" &&
          role !== "owner" &&
          (await activeOwners(tx, vaultId)) <= 1
        ) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "last owner" });
        }
        await tx
          .update(vaultMembersTable)
          .set({ role, updated_at: new Date() })
          .where(and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.userId, userId)));
      });
      await notifyVaultMembers(vaultId);
    }),

  /**
   * Remove a member or withdraw an invite (owners and managers; a manager
   * can't remove an owner). To leave, a member uses `leave`. Marks the vault
   * for a key rotation: the removed member knows the current key.
   */
  removeMember: protectedProcedure
    .input(vaultMemberInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { vaultId, userId } = input;
      if (userId === ctx.userId) throw new TRPCError({ code: "BAD_REQUEST" });

      await db.transaction(async (tx) => {
        const actor = await requireVaultRole(ctx.userId, vaultId, VAULT_MANAGE_ROLES, tx);
        await lockVaults(tx, [vaultId]);
        const target = await memberRow(tx, vaultId, userId);
        if (!canAssignRole(actor, target.role)) throw new TRPCError({ code: "FORBIDDEN" });
        await tx
          .delete(vaultMembersTable)
          .where(and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.userId, userId)));
        await requireRotation(tx, vaultId);
      });

      // Their next sync drops the vault from their devices.
      emitRecordsChanged(userId);
      await notifyVaultMembers(vaultId);
    }),

  /**
   * Leave a shared vault. The last owner can't (PRECONDITION_FAILED): they
   * hand the vault over first (`transferOwnership`) or delete it. Marks the
   * vault for a key rotation by the members who stay.
   */
  leave: protectedProcedure.input(vaultIdInputSchema).mutation(async ({ ctx, input }) => {
    const { vaultId } = input;
    await db.transaction(async (tx) => {
      const own = await ownMembership(tx, ctx.userId, vaultId);
      if (own.status !== "active") throw new TRPCError({ code: "NOT_FOUND" });
      if (own.kind !== "shared") throw new TRPCError({ code: "FORBIDDEN" });
      await lockVaults(tx, [vaultId]);
      if (own.role === "owner" && (await activeOwners(tx, vaultId)) <= 1) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "last owner" });
      }
      await tx
        .delete(vaultMembersTable)
        .where(
          and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.userId, ctx.userId)),
        );
      await requireRotation(tx, vaultId);
    });

    emitRecordsChanged(ctx.userId);
    await notifyVaultMembers(vaultId);
  }),

  /**
   * Hand the vault to another active member (owners only): they become an
   * owner (and the vault's `ownerId`), the caller a manager.
   */
  transferOwnership: protectedProcedure
    .input(vaultMemberInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { vaultId, userId } = input;
      if (userId === ctx.userId) throw new TRPCError({ code: "BAD_REQUEST" });

      await db.transaction(async (tx) => {
        const own = await ownMembership(tx, ctx.userId, vaultId);
        if (own.status !== "active") throw new TRPCError({ code: "NOT_FOUND" });
        if (own.role !== "owner" || own.kind !== "shared") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await lockVaults(tx, [vaultId]);
        const target = await memberRow(tx, vaultId, userId);
        // An invitee can't own a vault they haven't joined.
        if (target.status !== "active") throw new TRPCError({ code: "PRECONDITION_FAILED" });

        const now = new Date();
        await tx
          .update(vaultMembersTable)
          .set({ role: "owner", updated_at: now })
          .where(and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.userId, userId)));
        await tx
          .update(vaultMembersTable)
          .set({ role: "manage", updated_at: now })
          .where(
            and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.userId, ctx.userId)),
          );
        await tx
          .update(vaultsTable)
          .set({ ownerId: userId, updated_at: now })
          .where(and(eq(vaultsTable.vaultId, vaultId), ne(vaultsTable.kind, "personal")));
      });
      await notifyVaultMembers(vaultId);
    }),
};
