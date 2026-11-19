import { db, usersTable, vaultMembersTable, vaultsTable } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { keepOwnerIdActive, lockVaults } from "../vault/access";
import { SOLE_OWNER, SoleOwnerCause } from "./sole-owner";

/**
 * A hard delete (no `deleted_at`), refused with `SOLE_OWNER` before anything goes; shared vaults:
 * see docs/architecture/auth.md (Account deletion).
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
    // (deleting the user row would cascade into it). Locked first, the user's membership rows after
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
          .delete(vaultMembersTable)
          .where(
            and(eq(vaultMembersTable.vaultId, vault.vaultId), eq(vaultMembersTable.userId, userId)),
          );
        await keepOwnerIdActive(tx, vault.vaultId);
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
    // personal one) with their records and key links.
    // Their versions in vaults that stay keep `userId` null.
    await tx.delete(usersTable).where(eq(usersTable.userId, userId));

    return { emailHash: user.emailHash, leftVaultIds };
  });
}
