import type { MemberVault } from "@repo/schema";
import { and, eq, inArray, isNull, max } from "drizzle-orm";
import type { LocalDb } from "../local-db";
import { records, revokedRecords, revokedVaults } from "./tables";

/** A vault the user lost access to, with the unsent record versions kept from it. */
export type RevokedVault = {
  vault: MemberVault;
  revokedAt: string;
  records: RevokedRecord[];
};

export type RevokedRecord = typeof revokedRecords.$inferSelect;

export async function clearRevokedTables(db: LocalDb) {
  await db.delete(revokedRecords);
  await db.delete(revokedVaults);
}

/**
 * Keep what the user wrote in these vaults and the server never got (ADR 0001
 * D7, revoked while offline): the latest version of every record whose latest
 * version is pending and not a delete, next to the vault's row so its key
 * still opens them. Vaults without such a record leave nothing behind. Run
 * inside the transaction that drops the vaults, before it does.
 */
export async function keepRevokedChanges(vaults: readonly MemberVault[], db: LocalDb) {
  if (vaults.length === 0) return;
  const latest = db
    .select({ recordId: records.recordId, maxVersion: max(records.version).as("maxVersion") })
    .from(records)
    .where(
      inArray(
        records.vaultId,
        vaults.map((v) => v.vaultId),
      ),
    )
    .groupBy(records.recordId)
    .as("latest");
  const rows = await db
    .select({
      recordId: records.recordId,
      vaultId: records.vaultId,
      encryptedData: records.encryptedData,
      encryptionNonce: records.encryptionNonce,
      cryptoVersion: records.cryptoVersion,
      keyVersion: records.keyVersion,
      version: records.version,
      clientUpdatedAt: records.clientUpdatedAt,
    })
    .from(records)
    .innerJoin(
      latest,
      and(eq(records.recordId, latest.recordId), eq(records.version, latest.maxVersion)),
    )
    .where(and(eq(records.syncState, "pending"), isNull(records.deleted_at)));
  if (rows.length === 0) return;

  const revokedAt = new Date().toISOString();
  const kept = new Set(rows.map((row) => row.vaultId));
  for (const vault of vaults) {
    if (!kept.has(vault.vaultId)) continue;
    await db
      .insert(revokedVaults)
      .values({ ...vault, revokedAt })
      .onConflictDoUpdate({ target: revokedVaults.vaultId, set: { ...vault, revokedAt } });
  }
  for (const row of rows) {
    await db
      .insert(revokedRecords)
      .values(row)
      .onConflictDoUpdate({ target: revokedRecords.recordId, set: row });
  }
}

export async function getRevokedVaults(db: LocalDb): Promise<RevokedVault[]> {
  const vaults = await db.select().from(revokedVaults);
  if (vaults.length === 0) return [];
  const rows = await db.select().from(revokedRecords);
  return vaults.map(({ revokedAt, ...vault }) => ({
    vault,
    revokedAt,
    records: rows.filter((row) => row.vaultId === vault.vaultId),
  }));
}

export async function deleteRevokedVault(vaultId: string, db: LocalDb) {
  await db.delete(revokedRecords).where(eq(revokedRecords.vaultId, vaultId));
  await db.delete(revokedVaults).where(eq(revokedVaults.vaultId, vaultId));
}
