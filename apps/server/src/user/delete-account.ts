import { db, usersTable, vaultMembersTable, vaultsTable } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { lockVaults } from "../vault/access";
import { SOLE_OWNER, SoleOwnerCause } from "./sole-owner";

/**
 * Delete an account and everything stored for it, for good (no `deleted_at`):
 * the OPAQUE record, every key set, the keypair, the personal vault with all
 * its record versions and tombstones, the vaults it soft-deleted, its
 * memberships and the invites it sent that weren't accepted yet.
 *
 * Shared vaults:
 * - nobody else active in it: deleted with its records (pending invites go too)
 * - the user is its only active owner and others are in it: refused with
 *   PRECONDITION_FAILED (`SOLE_OWNER`, the vaults in `data.vaultIds`),
 *   nothing is deleted; they hand it over
 *   (`transferOwnership`) or delete it first
 * - otherwise the user leaves it like `vault.leave` (marked for a key
 *   rotation); its records stay with the vault, their author becomes null
 *
 * A key the user sealed to a member after a rotation and not yet accepted
 * can't be opened any more (its sender's keypair is gone, `keyUpdates` leaves
 * it out); the rotation the deletion triggers seals a new one.
 *
 * @returns the user's email hash and the shared vaults they left
 */
export async function deleteAccount(
  userId: string,
): Promise<{ emailHash: string; leftVaultIds: string[] }> {
  return await db.transaction(async (tx) => {
    // NO KEY UPDATE: a concurrent record insert's FK check (KEY SHARE) on this
    // row must not wait on us while we wait on its vault lock.
    const [user] = await tx
      .select({ emailHash: usersTable.emailHash })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .for("no key update");
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });

    // Every vault the user is in (any status) or is recorded as owner of
    // (after a demotion `ownerId` can still name them; deleting the user row
    // would cascade into it). Locked first, the user's membership rows after
    // (the order `removeMember` takes), so no invite is accepted meanwhile.
    const memberOf = tx
      .select({ vaultId: vaultMembersTable.vaultId })
      .from(vaultMembersTable)
      .where(eq(vaultMembersTable.userId, userId));
    const candidates = await tx
      .select({ vaultId: vaultsTable.vaultId })
      .from(vaultsTable)
      .where(or(eq(vaultsTable.ownerId, userId), inArray(vaultsTable.vaultId, memberOf)));
    await lockVaults(
      tx,
      candidates.map((v) => v.vaultId),
    );
    const own = await tx
      .select({ vaultId: vaultMembersTable.vaultId, status: vaultMembersTable.status })
      .from(vaultMembersTable)
      .where(eq(vaultMembersTable.userId, userId))
      .for("update");
    const activeIn = own.filter((m) => m.status === "active").map((m) => m.vaultId);

    const shared = await tx
      .select({ vaultId: vaultsTable.vaultId, ownerId: vaultsTable.ownerId })
      .from(vaultsTable)
      .where(
        and(
          eq(vaultsTable.kind, "shared"),
          isNull(vaultsTable.deleted_at),
          inArray(
            vaultsTable.vaultId,
            candidates.map((v) => v.vaultId),
          ),
          or(eq(vaultsTable.ownerId, userId), inArray(vaultsTable.vaultId, activeIn)),
        ),
      );

    const members =
      shared.length === 0
        ? []
        : await tx
            .select({
              vaultId: vaultMembersTable.vaultId,
              userId: vaultMembersTable.userId,
              role: vaultMembersTable.role,
            })
            .from(vaultMembersTable)
            .where(
              and(
                inArray(
                  vaultMembersTable.vaultId,
                  shared.map((v) => v.vaultId),
                ),
                eq(vaultMembersTable.status, "active"),
              ),
            );

    const soleOwned = shared.filter((vault) => {
      const others = members.filter((m) => m.vaultId === vault.vaultId && m.userId !== userId);
      return others.length > 0 && !others.some((m) => m.role === "owner");
    });
    if (soleOwned.length > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: SOLE_OWNER,
        cause: new SoleOwnerCause(soleOwned.map((v) => v.vaultId)),
      });
    }

    const now = new Date();
    const deleteVaultIds: string[] = [];
    const leftVaultIds: string[] = [];
    for (const vault of shared) {
      const inVault = members.filter((m) => m.vaultId === vault.vaultId);
      const isMember = inVault.some((m) => m.userId === userId);
      const otherOwner = inVault.find((m) => m.userId !== userId && m.role === "owner");

      if (!otherOwner) {
        // Nobody else active in it (sole ownership with others refused above).
        deleteVaultIds.push(vault.vaultId);
        continue;
      }
      if (vault.ownerId === userId) {
        await tx
          .update(vaultsTable)
          .set({ ownerId: otherOwner.userId, updated_at: now })
          .where(eq(vaultsTable.vaultId, vault.vaultId));
      }
      if (isMember) {
        // They still know the current key.
        await tx
          .update(vaultsTable)
          .set({ keyRotationNeeded: true, updated_at: now })
          .where(eq(vaultsTable.vaultId, vault.vaultId));
        leftVaultIds.push(vault.vaultId);
      }
    }

    // Invites they sent and nobody accepted: no one could open them any more.
    await tx
      .delete(vaultMembersTable)
      .where(
        and(eq(vaultMembersTable.sealedByUserId, userId), eq(vaultMembersTable.status, "pending")),
      );
    if (deleteVaultIds.length > 0) {
      await tx.delete(vaultsTable).where(inArray(vaultsTable.vaultId, deleteVaultIds));
    }
    // Cascades: key sets, keypairs, memberships, the vaults they own (the
    // personal one and soft-deleted ones) with their records and key links.
    // Their versions in vaults that stay keep `userId` null.
    await tx.delete(usersTable).where(eq(usersTable.userId, userId));

    return { emailHash: user.emailHash, leftVaultIds };
  });
}
