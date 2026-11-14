import type { MemberVault } from "@repo/schema";
import { sql } from "drizzle-orm";
import type { LocalDb } from "../local-db";
import { knownVaults } from "./tables";

export type KnownVault = Pick<MemberVault, "vaultId" | "kind" | "keyVersion">;

export async function clearKnownVaultsTable(db: LocalDb) {
  await db.delete(knownVaults);
}

export async function getKnownVaults(db: LocalDb): Promise<KnownVault[]> {
  return await db.select().from(knownVaults);
}

/** Note the vaults as seen: a key version only ever goes up, a kind is kept as first seen. */
export async function rememberVaults(list: readonly KnownVault[], db: LocalDb) {
  if (list.length === 0) return;
  await db
    .insert(knownVaults)
    .values(list.map(({ vaultId, kind, keyVersion }) => ({ vaultId, kind, keyVersion })))
    .onConflictDoUpdate({
      target: knownVaults.vaultId,
      set: { keyVersion: sql`max(${knownVaults.keyVersion}, excluded.keyVersion)` },
    });
}
