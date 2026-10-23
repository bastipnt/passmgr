import type { BiometricKeyMaterial } from "@repo/crypto";
import {
  ACCOUNT_KEY_MATERIAL_KEYS,
  type AccountKeyMaterial,
  canWriteVault,
  type EncryptedRecordSchema,
  type EncryptedVaultMeta,
  type MemberVault,
  type RecoveryKeySchema,
  type RecoveryWrapSchema,
  type SealedPendingRecovery,
  type UserPublicKey,
} from "@repo/schema";
import { inArray } from "drizzle-orm";
import type { SqlDriver } from "./driver";
import { createLocalDb, type LocalDb } from "./local-db";
import { migrate } from "./migrations";
import {
  type BreachCheck,
  type BreachCheckVersion,
  clearBreachChecks,
  clearProfileSettingsTable,
  deleteBreachChecksOf,
  deleteVaultBreachChecks,
  getBreachCheck,
  getBreachChecks,
  isBreachCheckEnabled,
  retainBreachChecks,
  setBreachCheckEnabled,
  upsertBreachChecks,
} from "./schema/breach-schema";
import {
  clearBiometricKey,
  clearKeysTable,
  clearPendingRecovery,
  clearRecoveryKey,
  getAccountKey,
  getBiometricKey,
  getPeerKey,
  getPendingRecovery,
  getRecoveryKey,
  getRecoveryWrap,
  isPeerRemoved,
  replaceRecoveryWrap,
  setPeerKey,
  setPeerRemoved,
  setPendingRecovery,
  upsertAccountKey,
  upsertBiometricKey,
  upsertRecoveryKey,
} from "./schema/keys-schema";
import {
  ackPendingChange,
  type ConflictResolver,
  clearOutboxTable,
  countParkedChanges,
  countPendingChanges,
  deleteVaultChanges,
  dropDeletesOfPurged,
  dropPurgedHistory,
  failPendingChange,
  getHead,
  getParkedChanges,
  getPendingChanges,
  getPendingUnderOldKeys,
  getRecordHistory,
  type LocalRecordChange,
  type LocalRecordVersion,
  type PendingChange,
  parkPendingChange,
  purgeRecord,
  type RecordCiphertext,
  RecordWriteError,
  type ReencryptedVersion,
  rebasePendingVersions,
  replacePendingCiphertexts,
  retryParkedChanges,
  writeLocalChange,
} from "./schema/outbox-schema";
import {
  clearProfileTable,
  getProfile,
  type LocalProfile,
  replaceProfile,
} from "./schema/profile-schema";
import {
  clearRecordsTable,
  deleteVaultRecords,
  getAllRecordsLatest,
  getByRecordId,
  getDeletedRecords,
  getRecordHeads,
  type RecordHead,
  upsertRecords,
} from "./schema/records-schema";
import {
  clearRevokedTables,
  deleteRevokedVault,
  getRevokedVaults,
  keepRevokedChanges,
  type RevokedVault,
} from "./schema/revoked-schema";
import {
  clearRekeyTarget,
  clearSyncTable,
  deleteSyncCursors,
  getRekeyTargets,
  getSyncCursors,
  setRekeyTarget,
  setSyncCursors,
} from "./schema/sync-schema";
import {
  keyMaterial,
  profile as profileTable,
  records,
  vaults as vaultsTable,
} from "./schema/tables";
import {
  clearVaultsTable,
  deleteVaultRows,
  getVaults,
  replaceVaults,
  setVaultMeta,
  upsertVault,
} from "./schema/vaults-schema";

/** `createLocalVault` on a device that already holds a vault. */
export class VaultExistsError extends Error {
  override message = "This device already holds a vault";
}

/**
 * Drop vaults from the device with everything in them: records, unsent changes,
 * pull cursors and unfinished rotations. Changes first: they are found through
 * the records.
 */
async function dropVaults(vaultIds: readonly string[], db: LocalDb) {
  await deleteVaultChanges(vaultIds, db);
  await deleteVaultRecords(vaultIds, db);
  await deleteSyncCursors(vaultIds, db);
  await deleteVaultBreachChecks(vaultIds, db);
}

/** Records a pulled `purged` tombstone deleted for good take their breach results along. */
async function dropPurgedBreachChecks(pulled: readonly EncryptedRecordSchema[], db: LocalDb) {
  const purged = pulled.filter((r) => r.tombstoneKind === "purged").map((r) => r.recordId);
  await deleteBreachChecksOf(purged, db);
}

/** One pull from the server: changed records plus the full list of the user's vaults. */
export type SyncBatch = {
  records: EncryptedRecordSchema[];
  vaults: MemberVault[];
  /** vaultId → the vault's next pull cursor. */
  cursors: Record<string, number>;
  serverTimestamp: string;
};

/** Whether two vault lists hold the same vaults with the same wraps, roles and metadata. */
export function sameVaults(a: readonly MemberVault[], b: readonly MemberVault[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((vault) => [vault.vaultId, vault]));
  return b.every((vault) => {
    const other = byId.get(vault.vaultId);
    return (
      other !== undefined &&
      (Object.keys(vault) as (keyof MemberVault)[]).every((key) =>
        key === "previousKeys"
          ? JSON.stringify(other[key]) === JSON.stringify(vault[key])
          : other[key] === vault[key],
      )
    );
  });
}

/**
 * Whether any trace of a vault is on the device: raw rows, not the parsed
 * profile or key material (those read as "nothing" when a row is malformed).
 * Biometric key rows alone don't count: without an account key they open nothing.
 * Sequential: the queries share one (transaction) connection.
 */
async function holdsAnyData(db: LocalDb): Promise<boolean> {
  const probes = [
    () => db.select({ id: profileTable.profileId }).from(profileTable).limit(1),
    () =>
      db
        .select({ key: keyMaterial.key })
        .from(keyMaterial)
        .where(inArray(keyMaterial.key, ACCOUNT_KEY_MATERIAL_KEYS))
        .limit(1),
    () => db.select({ id: vaultsTable.vaultId }).from(vaultsTable).limit(1),
    () => db.select({ id: records.recordId }).from(records).limit(1),
  ];
  for (const probe of probes) if ((await probe()).length > 0) return true;
  return false;
}

export class Vault {
  private driver: SqlDriver;
  private db: LocalDb;
  private initialized?: Promise<void>;

  constructor(driver: SqlDriver) {
    this.driver = driver;
    this.db = createLocalDb(driver);
    // Start migrating right away; callers see a failure through `ready()`.
    this.ready().catch(() => undefined);
  }

  private ready(): Promise<void> {
    this.initialized ??= migrate(this.driver).catch((error: unknown) => {
      // Let the next call retry instead of failing forever (e.g. after a lock timeout).
      this.initialized = undefined;
      throw error;
    });
    return this.initialized;
  }

  /** Run fn atomically against a Drizzle handle bound to the transaction. */
  private async transaction<T>(fn: (tx: LocalDb) => Promise<T>): Promise<T> {
    return await this.driver.transaction((tx) => fn(createLocalDb(tx)));
  }

  /**
   * RECORDS
   */

  /**
   * Store server rows. Pending local versions they collide with move up first,
   * as in a pull (`applySync`), so no unsynced change is overwritten.
   */
  async upsertRecords(records: EncryptedRecordSchema[]): Promise<void> {
    await this.ready();
    if (records.length === 0) return;
    await this.transaction(async (tx) => {
      await dropDeletesOfPurged(records, tx);
      await rebasePendingVersions(records, tx);
      await upsertRecords(records, tx);
      await dropPurgedHistory(
        records.map((r) => r.recordId),
        tx,
      );
      await dropPurgedBreachChecks(records, tx);
    });
  }

  /** The current records of one vault, or of all vaults when `vaultId` is omitted. */
  async getAllLatest(vaultId?: string): Promise<EncryptedRecordSchema[]> {
    await this.ready();
    return await getAllRecordsLatest(this.db, vaultId);
  }

  /** Every record id on the device, tombstones included: its vault and whether it's deleted. */
  async getRecordHeads(): Promise<RecordHead[]> {
    await this.ready();
    return await getRecordHeads(this.db);
  }

  async getByRecordId(recordId: string): Promise<EncryptedRecordSchema | undefined> {
    await this.ready();
    return await getByRecordId(recordId, this.db);
  }

  /** Every version of a record, newest first, unsynced local ones included. */
  async getRecordHistory(recordId: string): Promise<LocalRecordVersion[]> {
    await this.ready();
    return await getRecordHistory(recordId, this.db);
  }

  /**
   * LOCAL WRITES + OUTBOX (ADR 0001 D1, D8)
   */

  /**
   * Write changes as new `pending` record versions and enqueue them for the
   * server, all in one transaction (a move is a create plus a delete). Throws
   * `RecordWriteError`, writing nothing, when a change doesn't fit the record.
   * Resolves the written rows.
   */
  async writeLocalChanges(changes: readonly LocalRecordChange[]): Promise<EncryptedRecordSchema[]> {
    await this.ready();
    const now = new Date().toISOString();
    return await this.transaction(async (tx) => {
      const written: EncryptedRecordSchema[] = [];
      for (const change of changes) written.push(await writeLocalChange(change, now, tx));
      return written;
    });
  }

  /**
   * Delete records for good, in one transaction (`purgeRecord`): every version
   * and unsent change goes; one the server has leaves a `purged` tombstone to
   * push. A record that isn't here or is purged already is skipped. Throws,
   * purging nothing, for a record in a vault the user may not write to: the
   * server would refuse it, and the local copy would be gone for nothing.
   */
  async purgeRecords(recordIds: readonly string[]): Promise<void> {
    await this.ready();
    const now = new Date().toISOString();
    await this.transaction(async (tx) => {
      const writable = new Set(
        (await getVaults(tx)).filter((v) => canWriteVault(v.role)).map((v) => v.vaultId),
      );
      for (const recordId of recordIds) {
        const head = await getHead(recordId, tx);
        if (head && !writable.has(head.vaultId)) {
          throw new RecordWriteError(recordId, "its vault is read-only");
        }
        await purgeRecord(recordId, now, now, tx);
      }
      await deleteBreachChecksOf(recordIds, tx);
    });
  }

  /**
   * Records in the trash (deleted, not moved or purged): their tombstones, which
   * carry the content they had, of one vault or of all of them.
   */
  async getDeletedRecords(vaultId?: string): Promise<EncryptedRecordSchema[]> {
    await this.ready();
    return await getDeletedRecords(this.db, vaultId);
  }

  /** Changes waiting for the server, oldest first. */
  async getPendingChanges(limit?: number): Promise<PendingChange[]> {
    await this.ready();
    return await getPendingChanges(this.db, limit);
  }

  async countPendingChanges(): Promise<number> {
    await this.ready();
    return await countPendingChanges(this.db);
  }

  /** The server stored this change; `serverRow` is its copy, when it returned one. */
  async ackPendingChange(changeId: string, serverRow: EncryptedRecordSchema | null): Promise<void> {
    await this.ready();
    await this.transaction((tx) => ackPendingChange(changeId, serverRow, tx));
  }

  /**
   * A push of this change failed. `count: false` keeps the reason without
   * counting an attempt (the next pull resolves it, e.g. stale).
   */
  async failPendingChange(
    changeId: string,
    error: string,
    options?: { count?: boolean },
  ): Promise<void> {
    await this.ready();
    await failPendingChange(changeId, error, this.db, options);
  }

  /** Stop pushing this change until `retryParkedChanges` (ADR 0001 D8). */
  async parkPendingChange(changeId: string, error: string): Promise<void> {
    await this.ready();
    await parkPendingChange(changeId, error, this.db);
  }

  /** Parked changes, oldest first, with why they were parked (`lastError`). */
  async getParkedChanges(): Promise<PendingChange[]> {
    await this.ready();
    return await getParkedChanges(this.db);
  }

  /** Parked changes, a subset of `countPendingChanges`. */
  async countParkedChanges(): Promise<number> {
    await this.ready();
    return await countParkedChanges(this.db);
  }

  async retryParkedChanges(): Promise<void> {
    await this.ready();
    await retryParkedChanges(this.db);
  }

  /**
   * VAULT KEY ROTATION
   */

  /**
   * Pending versions with content under an older key than their vault's
   * current one, oldest first per record: re-encrypt them before a push.
   */
  async getPendingUnderOldKeys(): Promise<EncryptedRecordSchema[]> {
    await this.ready();
    return await getPendingUnderOldKeys(this.db);
  }

  /**
   * Write re-encrypted copies of records as their next versions, in one
   * transaction, each only if the record's head is still `headVersion` (the
   * version it was read from): an edit made meanwhile isn't buried under the
   * old content. Resolves how many were written.
   */
  async writeReencryptedVersions(
    versions: readonly (RecordCiphertext & { headVersion: number })[],
  ): Promise<number> {
    await this.ready();
    const now = new Date().toISOString();
    return await this.transaction(async (tx) => {
      let written = 0;
      for (const { headVersion, ...ciphertext } of versions) {
        const head = await getHead(ciphertext.recordId, tx);
        if (head?.version !== headVersion || head.deleted_at !== null) continue;
        await writeLocalChange({ ...ciphertext, kind: "update" }, now, tx);
        written++;
      }
      return written;
    });
  }

  /** Swap re-encrypted ciphertexts into pending versions, atomically. */
  async replacePendingCiphertexts(versions: readonly ReencryptedVersion[]): Promise<void> {
    await this.ready();
    if (versions.length === 0) return;
    await this.transaction((tx) => replacePendingCiphertexts(versions, tx));
  }

  /**
   * vaultId → key version: rotations this device started whose synced records
   * it still has to re-encrypt (resumed after an interruption).
   */
  async getRekeyTargets(): Promise<Record<string, number>> {
    await this.ready();
    return await getRekeyTargets(this.db);
  }

  /** Remember that the vault's records are to be re-encrypted once it reaches `keyVersion`. */
  async setRekeyTarget(vaultId: string, keyVersion: number): Promise<void> {
    await this.ready();
    await setRekeyTarget(vaultId, keyVersion, this.db);
  }

  async clearRekeyTarget(vaultId: string, keyVersion: number): Promise<void> {
    await this.ready();
    await clearRekeyTarget(vaultId, keyVersion, this.db);
  }

  /**
   * PROFILE (whose vault this is, ADR 0001 D2)
   */

  async getProfile(): Promise<LocalProfile | null> {
    await this.ready();
    return await getProfile(this.db);
  }

  /**
   * ACCOUNT KEY + VAULT KEYS (what an unlock without the server needs)
   */

  /**
   * Store the account key wrap and the vaults (with their key wraps) together,
   * atomically. With `profile`, the profile is replaced in the same transaction;
   * a `linked` one drops the recovery material a local vault kept (linking, ADR
   * 0001 D9: the server holds it now). `recoveryWrap` (a login's): the server's
   * recovery wrap replaces what is stored, and a pending recovery is dropped:
   * the login's key set supersedes it.
   */
  async setAccountKeyMaterial(
    material: AccountKeyMaterial,
    vaults: readonly MemberVault[],
    {
      profile,
      recoveryWrap,
    }: { profile?: LocalProfile; recoveryWrap?: RecoveryWrapSchema | null } = {},
  ): Promise<void> {
    await this.ready();
    await this.transaction(async (tx) => {
      if (profile) await replaceProfile(profile, tx);
      if (recoveryWrap !== undefined) {
        await replaceRecoveryWrap(recoveryWrap, tx);
        await clearPendingRecovery(tx);
      } else if (profile?.mode === "linked") await clearRecoveryKey(tx);
      await upsertAccountKey(material, tx);
      await replaceVaults(vaults, tx);
    });
  }

  /**
   * Set up a vault that lives on this device only (ADR 0001 D2, `local`
   * profile): the profile, the account key wraps (password + recovery, with the
   * recovery verifier kept for linking later) and the personal vault, in one
   * transaction. Refuses (throws) when the device already holds a vault: that
   * one is never replaced silently.
   */
  async createLocalVault(
    material: AccountKeyMaterial,
    recovery: RecoveryKeySchema,
    vaults: readonly MemberVault[],
    profile: LocalProfile & { mode: "local" },
  ): Promise<void> {
    await this.ready();
    await this.transaction(async (tx) => {
      if (await holdsAnyData(tx)) throw new VaultExistsError();
      await replaceProfile(profile, tx);
      await upsertAccountKey(material, tx);
      await upsertRecoveryKey(recovery, tx);
      await replaceVaults(vaults, tx);
    });
  }

  /**
   * Replace both account key wraps of a local vault, atomically (local
   * recovery, ADR 0001 D10: a new password and a new recovery key). Refuses
   * (throws) for any profile but a `local` one: a linked vault's key set is
   * the server's.
   */
  async setLocalKeyMaterial(
    material: AccountKeyMaterial,
    recovery: RecoveryKeySchema,
  ): Promise<void> {
    await this.ready();
    await this.transaction(async (tx) => {
      if ((await getProfile(tx))?.mode !== "local") throw new Error("Not a local vault");
      await upsertAccountKey(material, tx);
      await upsertRecoveryKey(recovery, tx);
    });
  }

  /**
   * A linked profile's password reset while offline (ADR 0001 D10 amended): the
   * new password wrap, the new recovery wrap and the pending server recovery,
   * atomically. Refuses (throws) for any profile but a `linked` one.
   */
  async setLinkedRecovery(
    material: AccountKeyMaterial,
    recoveryWrap: RecoveryWrapSchema,
    pending: SealedPendingRecovery,
  ): Promise<void> {
    await this.ready();
    await this.transaction(async (tx) => {
      if ((await getProfile(tx))?.mode !== "linked") throw new Error("Not a linked vault");
      await upsertAccountKey(material, tx);
      await replaceRecoveryWrap(recoveryWrap, tx);
      await setPendingRecovery(pending, tx);
    });
  }

  /** The recovery wrap of the account key: a local vault's, or a linked one's cached from its last login. */
  async getRecoveryWrap(): Promise<RecoveryWrapSchema | null> {
    await this.ready();
    return await getRecoveryWrap(this.db);
  }

  async getPendingRecovery(): Promise<SealedPendingRecovery | null> {
    await this.ready();
    return await getPendingRecovery(this.db);
  }

  async clearPendingRecovery(): Promise<void> {
    await this.ready();
    await clearPendingRecovery(this.db);
  }

  /** The recovery wrap + verifier of a local vault; null for a linked one (no verifier, see `getRecoveryWrap`). */
  async getRecoveryKeyMaterial(): Promise<RecoveryKeySchema | null> {
    await this.ready();
    return await getRecoveryKey(this.db);
  }

  async getAccountKeyMaterial(): Promise<AccountKeyMaterial | null> {
    await this.ready();
    return await getAccountKey(this.db);
  }

  async getVaults(): Promise<MemberVault[]> {
    await this.ready();
    return await getVaults(this.db);
  }

  /**
   * Add a vault next to the others (created on this device, or just created
   * on the server, before the next sync lists it), or replace its row.
   */
  async saveVault(vault: MemberVault): Promise<void> {
    await this.ready();
    await upsertVault(vault, this.db);
  }

  /** Replace a vault's encrypted name / icon / colour. Throws for a vault that isn't here. */
  async setVaultMeta(vaultId: string, meta: EncryptedVaultMeta): Promise<void> {
    await this.ready();
    if (!(await setVaultMeta(vaultId, meta, this.db))) throw new Error(`No vault ${vaultId}`);
  }

  /**
   * Remove a vault from the device, atomically, with its records, unsent
   * changes and pull cursor (it was deleted). With `keepUnsent` (the user left
   * it) the latest unsent version of each record is kept aside first, as for a
   * revoked vault (`getRevokedVaults`). Refuses (throws) for the personal
   * vault: every profile keeps exactly one.
   */
  async removeVault(vaultId: string, { keepUnsent = false } = {}): Promise<void> {
    await this.ready();
    await this.transaction(async (tx) => {
      const vault = (await getVaults(tx)).find((v) => v.vaultId === vaultId);
      if (vault?.kind === "personal") throw new Error("The personal vault can't be removed");
      // Left, not deleted: the unsent edits stay for rescue as after a revocation.
      if (keepUnsent && vault) await keepRevokedChanges([vault], tx);
      await dropVaults([vaultId], tx);
      await deleteVaultRows([vaultId], tx);
    });
  }

  /**
   * BIOMETRIC KEY
   */

  async setBiometricKeyMaterial(biometricKey: BiometricKeyMaterial): Promise<void> {
    await this.ready();
    await upsertBiometricKey(biometricKey, this.db);
  }

  async getBiometricKeyMaterial(): Promise<BiometricKeyMaterial | null> {
    await this.ready();
    return await getBiometricKey(this.db);
  }

  async clearBiometricKeyMaterial(): Promise<void> {
    await this.ready();
    await clearBiometricKey(this.db);
  }

  /**
   * SYNC META
   */

  /** vaultId → pull cursor, for every vault synced before. */
  async getSyncCursors(): Promise<Record<string, number>> {
    await this.ready();
    return await getSyncCursors(this.db);
  }

  /**
   * Apply one pull atomically: vaults the user lost access to are dropped with
   * their records, unsent changes and cursors (the latest unsent version of
   * each record kept aside first, `getRevokedVaults`), the vault list is replaced,
   * pending local versions that collide with pulled ones move up (and, with
   * `resolve`, get merged with them, ADR 0001 D5), records are upserted and
   * every vault's cursor advanced. Resolves whether the vault list changed (the
   * keys in memory then need reloading).
   */
  async applySync(
    { records, vaults, cursors, serverTimestamp }: SyncBatch,
    resolve?: ConflictResolver,
  ): Promise<boolean> {
    await this.ready();
    return await this.transaction(async (tx) => {
      const cached = await getVaults(tx);
      const current = new Set(vaults.map((v) => v.vaultId));
      const lost = cached.filter((v) => !current.has(v.vaultId));
      const removed = lost.map((v) => v.vaultId);

      // Unsent edits in a vault the user lost access to stay for rescue (ADR 0001 D7).
      await keepRevokedChanges(lost, tx);
      await dropVaults(removed, tx);
      const vaultsChanged = !sameVaults(cached, vaults);
      if (vaultsChanged) await replaceVaults(vaults, tx);

      const pulled = records.filter((r) => current.has(r.vaultId));
      await dropDeletesOfPurged(pulled, tx);
      await rebasePendingVersions(pulled, tx, { resolve, receivedAt: serverTimestamp });
      await upsertRecords(pulled, tx);
      await dropPurgedHistory(
        pulled.map((r) => r.recordId),
        tx,
      );
      await dropPurgedBreachChecks(pulled, tx);
      await setSyncCursors(
        Object.fromEntries(Object.entries(cursors).filter(([vaultId]) => current.has(vaultId))),
        tx,
      );
      return vaultsChanged;
    });
  }

  /**
   * SHARING (ADR 0001 D7)
   */

  /**
   * Vaults the user lost access to while this device had unsent changes in
   * them, each with those changes (the latest version of each record), until
   * they are copied elsewhere or discarded (`discardRevokedVault`).
   */
  async getRevokedVaults(): Promise<RevokedVault[]> {
    await this.ready();
    return await getRevokedVaults(this.db);
  }

  async discardRevokedVault(vaultId: string): Promise<void> {
    await this.ready();
    await this.transaction(async (tx) => await deleteRevokedVault(vaultId, tx));
  }

  /**
   * Write `changes` (copies of a revoked vault's records into another vault)
   * and drop what was kept of the revoked vault, in one transaction: an
   * interrupted copy leaves either both or neither, never duplicates on retry.
   */
  async rescueRevokedVault(
    vaultId: string,
    changes: readonly LocalRecordChange[],
  ): Promise<EncryptedRecordSchema[]> {
    await this.ready();
    const now = new Date().toISOString();
    return await this.transaction(async (tx) => {
      const written: EncryptedRecordSchema[] = [];
      for (const change of changes) written.push(await writeLocalChange(change, now, tx));
      await deleteRevokedVault(vaultId, tx);
      return written;
    });
  }

  /** Whether this device removed `userId` from the vault (`markPeerRemoved`). */
  async isPeerRemoved(vaultId: string, userId: string): Promise<boolean> {
    await this.ready();
    return await isPeerRemoved(vaultId, userId, this.db);
  }

  /** Note (or, on a new invite, forget) that `userId` was removed from the vault. */
  async markPeerRemoved(vaultId: string, userId: string, removed = true): Promise<void> {
    await this.ready();
    await setPeerRemoved(vaultId, userId, removed, this.db);
  }

  /** The public key pinned for another user (`pinPeerKey`), if any. */
  async getPeerKey(userId: string): Promise<UserPublicKey | null> {
    await this.ready();
    return await getPeerKey(userId, this.db);
  }

  /** Remember the public key another user sealed a vault key from. */
  async pinPeerKey(userId: string, key: UserPublicKey): Promise<void> {
    await this.ready();
    await setPeerKey(userId, key, this.db);
  }

  /**
   * BREACH CHECK
   */

  async isBreachCheckEnabled(): Promise<boolean> {
    await this.ready();
    return await isBreachCheckEnabled(this.db);
  }

  /** Off forgets every result, atomically. */
  async setBreachCheckEnabled(enabled: boolean): Promise<void> {
    await this.ready();
    await this.transaction((tx) => setBreachCheckEnabled(enabled, tx));
  }

  async getBreachChecks(): Promise<BreachCheck[]> {
    await this.ready();
    return await getBreachChecks(this.db);
  }

  /** One version's stored result; `null` when the check is off or it wasn't checked. */
  async getBreachCheck(version: BreachCheckVersion): Promise<BreachCheck | null> {
    await this.ready();
    if (!(await isBreachCheckEnabled(this.db))) return null;
    return await getBreachCheck(version, this.db);
  }

  /**
   * Store new results and, with `current`, drop those of every other version, in
   * one transaction. Nothing is stored once the check was turned off meanwhile.
   */
  async saveBreachChecks(
    checks: readonly BreachCheck[],
    current?: readonly BreachCheckVersion[],
  ): Promise<void> {
    await this.ready();
    await this.transaction(async (tx) => {
      if (!(await isBreachCheckEnabled(tx))) return;
      await upsertBreachChecks(checks, tx);
      if (current) await retainBreachChecks(current, tx);
    });
  }

  /**
   * CLEANUP
   */

  async clear(): Promise<void> {
    await this.ready();
    await this.transaction(async (tx) => {
      await clearOutboxTable(tx);
      await clearRecordsTable(tx);
      await clearKeysTable(tx);
      await clearSyncTable(tx);
      await clearVaultsTable(tx);
      await clearRevokedTables(tx);
      await clearProfileTable(tx);
      await clearBreachChecks(tx);
      await clearProfileSettingsTable(tx);
    });
  }

  async destroy(): Promise<void> {
    await this.driver.destroy();
  }

  /** Close the database and delete its file (removing a profile). Unusable afterwards. */
  async deleteDatabase(): Promise<void> {
    // Let a migration still running settle first: it holds the connection.
    await this.initialized?.catch(() => undefined);
    await this.driver.deleteDatabase();
  }
}
