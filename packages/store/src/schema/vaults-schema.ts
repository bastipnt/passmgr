import type { EncryptedVaultMeta, MemberVault } from "@repo/schema";
import { eq } from "drizzle-orm";
import type { LocalDb } from "../local-db";
import { vaults } from "./tables";

export async function clearVaultsTable(db: LocalDb) {
  await db.delete(vaults);
}

/** Replace the cached vaults with the server's list. Run inside a transaction. */
export async function replaceVaults(memberVaults: readonly MemberVault[], db: LocalDb) {
  await db.delete(vaults);
  if (memberVaults.length > 0) await db.insert(vaults).values([...memberVaults]);
}

export async function getVaults(db: LocalDb): Promise<MemberVault[]> {
  return await db.select().from(vaults);
}

/** Add a vault, or replace the row of the one with its id. */
export async function upsertVault(vault: MemberVault, db: LocalDb) {
  const { vaultId: _vaultId, ...rest } = vault;
  await db.insert(vaults).values(vault).onConflictDoUpdate({ target: vaults.vaultId, set: rest });
}

/** Resolves whether the vault was there. */
export async function setVaultMeta(
  vaultId: string,
  meta: EncryptedVaultMeta,
  db: LocalDb,
): Promise<boolean> {
  const updated = await db
    .update(vaults)
    .set({ encryptedMeta: meta.encryptedMeta, metaEncryptionNonce: meta.metaEncryptionNonce })
    .where(eq(vaults.vaultId, vaultId))
    .returning({ vaultId: vaults.vaultId });
  return updated.length > 0;
}

export async function deleteVaultRows(vaultIds: readonly string[], db: LocalDb) {
  for (const vaultId of vaultIds) await db.delete(vaults).where(eq(vaults.vaultId, vaultId));
}
