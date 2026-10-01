import type { MemberVaultKey } from "@repo/schema";
import type { LocalDb } from "../local-db";
import { vaults } from "./tables";

export async function clearVaultsTable(db: LocalDb) {
  await db.delete(vaults);
}

/** Replace the cached vault keys with the server's list. Run inside a transaction. */
export async function replaceVaultKeys(wraps: readonly MemberVaultKey[], db: LocalDb) {
  await db.delete(vaults);
  if (wraps.length > 0) await db.insert(vaults).values([...wraps]);
}

export async function getVaultKeys(db: LocalDb): Promise<MemberVaultKey[]> {
  return await db.select().from(vaults);
}
