import { vaultsTable } from "@repo/db";
import { and, inArray, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "../vault/access";

const DEFAULT_STORAGE_QUOTA_MB = 100;

function storageQuotaBytes(): number {
  const raw = process.env.STORAGE_QUOTA_MB?.trim();
  const mb = raw ? Number(raw) : DEFAULT_STORAGE_QUOTA_MB;
  if (!Number.isFinite(mb) || mb <= 0) {
    throw new Error("STORAGE_QUOTA_MB must be a positive number of megabytes");
  }
  return mb * 1024 * 1024;
}

/** What every vault owner may store across their live vaults, history and tombstones included. */
export const STORAGE_QUOTA_BYTES = storageQuotaBytes();

/** Bytes an owner may still add; shared by every vault they own. */
export type StorageBudget = { remaining: number };

/**
 * The budget of each vault's owner, by vault id. Only the given vaults are
 * locked, so a concurrent push to another vault of the same owner can take
 * them slightly past the quota.
 */
export async function storageBudgets(
  tx: DbExecutor,
  vaultIds: string[],
): Promise<Map<string, StorageBudget>> {
  if (vaultIds.length === 0) return new Map();
  const owners = await tx
    .select({ vaultId: vaultsTable.vaultId, ownerId: vaultsTable.ownerId })
    .from(vaultsTable)
    .where(inArray(vaultsTable.vaultId, vaultIds));
  const usage = await tx
    .select({
      ownerId: vaultsTable.ownerId,
      used: sql<string>`sum(${vaultsTable.usedBytes})`,
    })
    .from(vaultsTable)
    .where(
      and(
        inArray(vaultsTable.ownerId, [...new Set(owners.map((o) => o.ownerId))]),
        // A deleted vault's records can't be reached any more, so they can't be purged either.
        isNull(vaultsTable.deleted_at),
      ),
    )
    .groupBy(vaultsTable.ownerId);

  const byOwner = new Map(
    usage.map(({ ownerId, used }) => [ownerId, { remaining: STORAGE_QUOTA_BYTES - Number(used) }]),
  );
  return new Map(owners.map(({ vaultId, ownerId }) => [vaultId, byOwner.get(ownerId)!]));
}
