import type { MemberVault } from "@repo/schema";
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
