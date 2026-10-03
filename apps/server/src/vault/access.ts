import { db, vaultMembersTable, vaultsTable } from "@repo/db";
import type { MemberVault, VaultRole } from "@repo/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { emitRecordsChanged } from "../events/record-events";

/** The db handle or a transaction on it. */
export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Access is via an active membership of a live vault (ADR 0001 D6). */
function activeMembership(userId: string) {
  return and(
    eq(vaultMembersTable.userId, userId),
    eq(vaultMembersTable.status, "active"),
    isNull(vaultsTable.deleted_at),
  );
}

/** Every vault the user can access, with their wrap of its key and its metadata. */
export async function memberVaults(userId: string, tx: DbExecutor = db): Promise<MemberVault[]> {
  return await tx
    .select({
      vaultId: vaultMembersTable.vaultId,
      keyVersion: vaultMembersTable.keyVersion,
      encryptedVaultKey: vaultMembersTable.encryptedVaultKey,
      vaultKeyEncryptionNonce: vaultMembersTable.vaultKeyEncryptionNonce,
      role: vaultMembersTable.role,
      kind: vaultsTable.kind,
      encryptedMeta: vaultsTable.encryptedMeta,
      metaEncryptionNonce: vaultsTable.metaEncryptionNonce,
    })
    .from(vaultMembersTable)
    .innerJoin(vaultsTable, eq(vaultsTable.vaultId, vaultMembersTable.vaultId))
    .where(activeMembership(userId));
}

/**
 * The user's role in a vault. Throws NOT_FOUND when they aren't an active
 * member (the same answer as for a vault that doesn't exist) and FORBIDDEN
 * when their role isn't one of `allowed`.
 */
export async function requireVaultRole(
  userId: string,
  vaultId: string,
  allowed: readonly VaultRole[],
  tx: DbExecutor = db,
): Promise<VaultRole> {
  const [member] = await tx
    .select({ role: vaultMembersTable.role })
    .from(vaultMembersTable)
    .innerJoin(vaultsTable, eq(vaultsTable.vaultId, vaultMembersTable.vaultId))
    .where(and(eq(vaultMembersTable.vaultId, vaultId), activeMembership(userId)));

  if (!member) throw new TRPCError({ code: "NOT_FOUND" });
  if (!allowed.includes(member.role)) throw new TRPCError({ code: "FORBIDDEN" });
  return member.role;
}

/** Ping every active member's sync stream after a vault's records or metadata changed. */
export async function notifyVaultMembers(vaultId: string): Promise<void> {
  const members = await db
    .select({ userId: vaultMembersTable.userId })
    .from(vaultMembersTable)
    .where(and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.status, "active")));
  for (const { userId } of members) emitRecordsChanged(userId);
}
