import { db, vaultKeyLinksTable, vaultMembersTable, vaultsTable } from "@repo/db";
import type { MemberVault, VaultKeyLink, VaultRole } from "@repo/schema";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
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

/**
 * Every vault the user can access, with their wrap of its current key, its
 * earlier keys (oldest first) and its metadata.
 */
export async function memberVaults(userId: string, tx: DbExecutor = db): Promise<MemberVault[]> {
  const vaults = await tx
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
  if (vaults.length === 0) return [];

  const links = await tx
    .select()
    .from(vaultKeyLinksTable)
    .where(
      inArray(
        vaultKeyLinksTable.vaultId,
        vaults.map((v) => v.vaultId),
      ),
    )
    .orderBy(asc(vaultKeyLinksTable.keyVersion));
  const previousKeys = new Map<string, VaultKeyLink[]>();
  for (const { vaultId, keyVersion, encryptedVaultKey, vaultKeyEncryptionNonce } of links) {
    // Only the keys below the member's own: those are what their key opens.
    const list = previousKeys.get(vaultId) ?? [];
    list.push({ keyVersion, encryptedVaultKey, vaultKeyEncryptionNonce });
    previousKeys.set(vaultId, list);
  }
  return vaults.map((vault) => ({
    ...vault,
    previousKeys: (previousKeys.get(vault.vaultId) ?? []).filter(
      (link) => link.keyVersion < vault.keyVersion,
    ),
  }));
}

/**
 * The current key version of each vault, read in `tx` (lock the vaults first
 * for an answer that holds until it commits). A vault that doesn't exist is
 * left out.
 */
export async function vaultKeyVersions(
  tx: DbExecutor,
  vaultIds: Iterable<string>,
): Promise<Map<string, number>> {
  const ids = [...new Set(vaultIds)];
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ vaultId: vaultsTable.vaultId, keyVersion: vaultsTable.keyVersion })
    .from(vaultsTable)
    .where(inArray(vaultsTable.vaultId, ids));
  return new Map(rows.map((row) => [row.vaultId, row.keyVersion]));
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
 * Take the vault's next `count` values of `records.seq` (ADR 0001 D8) for
 * records written in `tx`, and resolve the first: the run is `first … first +
 * count - 1`. Bumping `vaults.lastSeq` row-locks the vault until `tx` ends, so
 * writers of one vault queue up and commit in `seq` order: a pull that sees a
 * vault's seq N sees every seq below it. A transaction writing to several
 * vaults locks them in id order first (`lockVaults`), so it can't deadlock.
 */
export async function takeVaultSeqs(
  tx: DbExecutor,
  vaultId: string,
  count: number,
): Promise<number> {
  const [vault] = await tx
    .update(vaultsTable)
    .set({ lastSeq: sql`${vaultsTable.lastSeq} + ${count}` })
    .where(eq(vaultsTable.vaultId, vaultId))
    .returning({ lastSeq: vaultsTable.lastSeq });
  if (!vault) throw new TRPCError({ code: "NOT_FOUND" });
  return vault.lastSeq - count + 1;
}

/** The vault's next seq, for a single record written in `tx` (`takeVaultSeqs`). */
export async function nextVaultSeq(tx: DbExecutor, vaultId: string): Promise<number> {
  return await takeVaultSeqs(tx, vaultId, 1);
}

/**
 * Row-lock vaults until `tx` ends, in id order (no deadlock), without taking a
 * seq: writers of these vaults wait, so whatever `tx` reads of their records
 * stays current until it commits. Seqs are then taken with `takeVaultSeqs`.
 */
export async function lockVaults(tx: DbExecutor, vaultIds: Iterable<string>): Promise<void> {
  for (const vaultId of [...new Set(vaultIds)].sort()) {
    await tx
      .select({ vaultId: vaultsTable.vaultId })
      .from(vaultsTable)
      .where(eq(vaultsTable.vaultId, vaultId))
      .for("update");
  }
}

/**
 * Ping every active member's sync stream after the vaults' records or metadata
 * changed, once per member however many of the vaults they share.
 */
export async function notifyVaultMembers(...vaultIds: string[]): Promise<void> {
  if (vaultIds.length === 0) return;
  const members = await db
    .selectDistinct({ userId: vaultMembersTable.userId })
    .from(vaultMembersTable)
    .where(
      and(inArray(vaultMembersTable.vaultId, vaultIds), eq(vaultMembersTable.status, "active")),
    );
  for (const { userId } of members) emitRecordsChanged(userId);
}
