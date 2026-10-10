import { canWriteVault, type RecordPayload, upgradeRecordPayload } from "@repo/schema";
import { type RevokedVault, secretsStore, type Vault } from "@repo/store";
import { encryptRecord } from "../util/encrypt-record";

/*
 * Access revoked while offline (ADR 0001 D7): the server rejects the unsent
 * changes of a vault the user isn't a member of any more, and the next pull
 * drops the vault. Its latest unsent version of each record is kept aside
 * (`Vault.getRevokedVaults`) until the user copies it to a vault they still
 * have, or discards it.
 */

/** A revoked vault as the UI shows it: its name and the unsent records, opened. */
export type RevokedVaultInfo = {
  vaultId: string;
  /** Null when the cached metadata doesn't open. */
  name: string | null;
  revokedAt: string;
  records: { recordId: string; payload: RecordPayload }[];
  /** Records that don't open any more (their key is missing from the cached chain). */
  unreadable: number;
};

function open({ vault, revokedAt, records }: RevokedVault): RevokedVaultInfo {
  const { meta, rows } = secretsStore.decryptWithWrap(vault, records);
  const opened: RevokedVaultInfo["records"] = [];
  let unreadable = 0;
  for (const [i, bytes] of rows.entries()) {
    try {
      if (!bytes) throw new Error("doesn't open");
      opened.push({
        recordId: records[i]!.recordId,
        payload: upgradeRecordPayload(JSON.parse(new TextDecoder().decode(bytes))),
      });
    } catch {
      unreadable++;
    }
  }
  return {
    vaultId: vault.vaultId,
    name: meta?.name ?? null,
    revokedAt,
    records: opened,
    unreadable,
  };
}

/** The vaults lost with unsent changes in them, opened. One whose key doesn't open is left out. */
export async function getRevokedVaults(vault: Vault): Promise<RevokedVaultInfo[]> {
  const infos: RevokedVaultInfo[] = [];
  for (const revoked of await vault.getRevokedVaults()) {
    try {
      infos.push(open(revoked));
    } catch (error) {
      console.warn(`Revoked vault ${revoked.vault.vaultId} doesn't open`, error);
    }
  }
  return infos;
}

/** The target of a copy isn't a vault the user can write to. */
export class RescueTargetError extends Error {
  override message = "Pick a vault you can edit to copy the items into";
}

/**
 * Copy a revoked vault's unsent records into a vault the user can write to (the
 * personal one by default) as new records, and drop what was kept, in one
 * local transaction: interrupted, it copied nothing and can run again.
 * Resolves how many were copied.
 */
export async function copyRevokedRecords(
  { vault }: { vault: Vault },
  vaultId: string,
  targetVaultId = secretsStore.defaultVaultId,
): Promise<number> {
  const target = (await vault.getVaults()).find((v) => v.vaultId === targetVaultId);
  if (!target || !canWriteVault(target.role)) throw new RescueTargetError();
  const revoked = (await vault.getRevokedVaults()).find((r) => r.vault.vaultId === vaultId);
  if (!revoked) return 0;

  const { records: opened } = open(revoked);
  const now = new Date().toISOString();
  // A payload is record data plus its schema version, which `encryptRecord` writes anew.
  const changes = opened.map(({ payload }) => {
    // The ciphertext is bound to the new record's id and vault.
    const context = { recordId: crypto.randomUUID(), vaultId: target.vaultId };
    return {
      kind: "create" as const,
      ...context,
      ...encryptRecord(payload, context),
      clientUpdatedAt: now,
    };
  });
  await vault.rescueRevokedVault(vaultId, changes);
  return changes.length;
}
