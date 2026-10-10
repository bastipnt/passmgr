import { CURRENT_CRYPTO_VERSION, type EncryptedRecordSchema } from "@repo/schema";
import {
  type RecordCiphertext,
  type ReencryptedVersion,
  secretsStore,
  type Vault,
} from "@repo/store";

/**
 * Vault-key rotation, the record side (ADR 0001 D7): once a vault is at a new
 * key version, the server takes puts under that key only. Records are
 * re-encrypted on the device, the plaintext unchanged, and reach the server
 * through the outbox like any other write.
 */

/** How many records one local write re-encrypts: a big vault rotates in several short transactions. */
export const REKEY_BATCH_SIZE = 100;

/** Records already reported as unreadable, so a sync doesn't log them on every push. */
const reportedUnreadable = new Set<string>();

/**
 * The record's plaintext re-encrypted under its vault's current key; `later`
 * when that can't be done here yet (the new key isn't loaded); `unreadable`
 * when the key it's under doesn't open it, which no retry changes.
 */
function reencrypt(row: EncryptedRecordSchema) {
  let currentKeyVersion: number;
  try {
    currentKeyVersion = secretsStore.currentKeyVersion(row.vaultId);
  } catch {
    return "later" as const;
  }
  if (currentKeyVersion <= row.keyVersion) return "later" as const;
  try {
    const plaintext = new TextDecoder().decode(secretsStore.decryptRecord(row));
    const [encryptedData, encryptionNonce, keyVersion] = secretsStore.encryptRecord(
      { recordId: row.recordId, vaultId: row.vaultId },
      plaintext,
    );
    return { encryptedData, encryptionNonce, cryptoVersion: CURRENT_CRYPTO_VERSION, keyVersion };
  } catch (error) {
    const id = `${row.recordId}/${row.version}`;
    if (!reportedUnreadable.has(id)) {
      reportedUnreadable.add(id);
      console.warn(`Record ${row.recordId} can't be re-encrypted: its key doesn't open it`, error);
    }
    return "unreadable" as const;
  }
}

/**
 * Re-encrypt the pending versions written under a key their vault has since
 * left (an edit made before this device learned of a rotation, or the whole
 * history of a local vault waiting to be linked), in place: the server doesn't
 * have them yet. Tombstones stay: a delete sends no ciphertext. In batches, so
 * a big history doesn't hold one long transaction. A version that can't be
 * re-encrypted stays as it is: the server rejects it until it's parked.
 */
export async function reencryptPendingVersions(vault: Vault): Promise<void> {
  let batch: ReencryptedVersion[] = [];
  for (const row of await vault.getPendingUnderOldKeys()) {
    const ciphertext = reencrypt(row);
    if (typeof ciphertext === "string") continue;
    batch.push({
      recordId: row.recordId,
      version: row.version,
      fromKeyVersion: row.keyVersion,
      ...ciphertext,
    });
    if (batch.length === REKEY_BATCH_SIZE) {
      await vault.replacePendingCiphertexts(batch);
      batch = [];
    }
  }
  await vault.replacePendingCiphertexts(batch);
}

/**
 * Re-encrypt the live records of the vaults this device rotated
 * (`Vault.setRekeyTarget`) as new versions, in batches through the outbox.
 * Resumable: a rotation stays on the list until none of its vault's records
 * is under an older key, so an interrupted one carries on with the next call.
 * A vault not at the rotation's key version yet (the server hasn't confirmed
 * it, or its key isn't loaded) waits. Resolves whether anything was written.
 *
 * Only the rotating device rewrites synced records: two devices doing it at
 * once would only fork every record into a conflict.
 */
export async function reencryptRotatedVaults(vault: Vault): Promise<boolean> {
  const targets = Object.entries(await vault.getRekeyTargets());
  if (targets.length === 0) return false;

  const vaults = new Map((await vault.getVaults()).map((v) => [v.vaultId, v.keyVersion]));
  let wrote = false;
  for (const [vaultId, target] of targets) {
    const keyVersion = vaults.get(vaultId);
    if (keyVersion === undefined) {
      // The vault is gone from this device; nothing left to re-encrypt.
      await vault.clearRekeyTarget(vaultId, target);
      continue;
    }
    if (keyVersion < target || !hasCurrentKey(vaultId, keyVersion)) continue;

    const stale = (await vault.getAllLatest(vaultId)).filter((r) => r.keyVersion < keyVersion);
    const changes: (RecordCiphertext & { headVersion: number })[] = [];
    let waiting = false;
    for (const row of stale) {
      const ciphertext = reencrypt(row);
      // An unreadable record stays as it is: no retry would open it.
      if (ciphertext === "unreadable") continue;
      if (ciphertext === "later") {
        waiting = true;
        continue;
      }
      changes.push({
        recordId: row.recordId,
        vaultId,
        ...ciphertext,
        // Not an edit: the record keeps its edit time (a merge compares it, D5).
        clientUpdatedAt: row.clientUpdatedAt,
        // Edited meanwhile: that edit is under the new key already, and stays on top.
        headVersion: row.version,
      });
    }
    for (let i = 0; i < changes.length; i += REKEY_BATCH_SIZE) {
      const written = await vault.writeReencryptedVersions(changes.slice(i, i + REKEY_BATCH_SIZE));
      wrote ||= written > 0;
    }
    // A record that can't be re-encrypted yet keeps the rotation open for the next try.
    if (!waiting) await vault.clearRekeyTarget(vaultId, target);
  }
  return wrote;
}

function hasCurrentKey(vaultId: string, keyVersion: number): boolean {
  try {
    return secretsStore.currentKeyVersion(vaultId) === keyVersion;
  } catch {
    return false;
  }
}

/**
 * Everything a push needs re-encrypted first (`SyncManager`'s `prepareOutbox`).
 * Nothing to do while no vault was ever rotated (every rotation waits for its
 * vault's key version to move), so the common case costs one small query.
 */
export async function reencryptForPush(vault: Vault): Promise<void> {
  if ((await vault.getVaults()).every((v) => v.keyVersion === 1)) return;
  await reencryptPendingVersions(vault);
  await reencryptRotatedVaults(vault);
}
