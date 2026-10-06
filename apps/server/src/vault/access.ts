import { db, vaultMembersTable, vaultsTable } from "@repo/db";
import type { MemberVault, VaultRole } from "@repo/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
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

/**
 * The next `records.seq` of each vault, for records written in `tx` (ADR 0001
 * D8). Bumping `vaults.lastSeq` row-locks the vault until `tx` ends, so writers
 * of one vault queue up and commit in `seq` order: a pull that sees a vault's
 * seq N sees every seq below it. Vaults are locked in id order, so two moves
 * between the same vaults in opposite directions can't deadlock.
 */
export async function nextVaultSeqs(
  tx: DbExecutor,
  ...vaultIds: string[]
): Promise<(vaultId: string) => number> {
  const seqs = new Map<string, number>();
  for (const vaultId of [...new Set(vaultIds)].sort()) {
    const [vault] = await tx
      .update(vaultsTable)
      .set({ lastSeq: sql`${vaultsTable.lastSeq} + 1` })
      .where(eq(vaultsTable.vaultId, vaultId))
      .returning({ lastSeq: vaultsTable.lastSeq });
    if (!vault) throw new TRPCError({ code: "NOT_FOUND" });
    seqs.set(vaultId, vault.lastSeq);
  }
  // Never a made-up seq: one that isn't the vault's next would break the cursor.
  return (vaultId) => {
    const seq = seqs.get(vaultId);
    if (seq === undefined) throw new Error(`no seq taken for vault ${vaultId}`);
    return seq;
  };
}

/** `nextVaultSeqs` for a single vault. */
export async function nextVaultSeq(tx: DbExecutor, vaultId: string): Promise<number> {
  return (await nextVaultSeqs(tx, vaultId))(vaultId);
}

/** Ping every active member's sync stream after a vault's records or metadata changed. */
export async function notifyVaultMembers(vaultId: string): Promise<void> {
  const members = await db
    .select({ userId: vaultMembersTable.userId })
    .from(vaultMembersTable)
    .where(and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.status, "active")));
  for (const { userId } of members) emitRecordsChanged(userId);
}
