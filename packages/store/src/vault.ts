import type { BiometricKeyMaterial } from "@repo/crypto";
import {
  ACCOUNT_KEY_MATERIAL_KEYS,
  type AccountKeyMaterial,
  type EncryptedRecordSchema,
  type MemberVault,
  type RecoveryKeySchema,
} from "@repo/schema";
import { inArray } from "drizzle-orm";
import type { SqlDriver } from "./driver";
import { createLocalDb, type LocalDb } from "./local-db";
import { migrate } from "./migrations";
import {
  clearBiometricKey,
  clearKeysTable,
  getAccountKey,
  getBiometricKey,
  getRecoveryKey,
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
  failPendingChange,
  getParkedChanges,
  getPendingChanges,
  getRecordHistory,
  type LocalRecordChange,
  type LocalRecordVersion,
  type PendingChange,
  parkPendingChange,
  rebasePendingVersions,
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
  upsertRecords,
} from "./schema/records-schema";
import {
  clearSyncTable,
  deleteSyncCursors,
  getSyncCursors,
  setSyncCursors,
} from "./schema/sync-schema";
import {
  keyMaterial,
  profile as profileTable,
  records,
  vaults as vaultsTable,
} from "./schema/tables";
import { clearVaultsTable, getVaults, replaceVaults } from "./schema/vaults-schema";

/** `createLocalVault` on a device that already holds a vault. */
export class VaultExistsError extends Error {
  override message = "This device already holds a vault";
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
      (Object.keys(vault) as (keyof MemberVault)[]).every((key) => other[key] === vault[key])
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
      await rebasePendingVersions(records, tx);
      await upsertRecords(records, tx);
    });
  }

  /** The current records of one vault, or of all vaults when `vaultId` is omitted. */
  async getAllLatest(vaultId?: string): Promise<EncryptedRecordSchema[]> {
    await this.ready();
    return await getAllRecordsLatest(this.db, vaultId);
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
   * atomically. With `profile`, the profile is replaced in the same transaction.
   */
  async setAccountKeyMaterial(
    material: AccountKeyMaterial,
    vaults: readonly MemberVault[],
    profile?: LocalProfile,
  ): Promise<void> {
    await this.ready();
    await this.transaction(async (tx) => {
      if (profile) await replaceProfile(profile, tx);
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

  /** The recovery wrap + verifier of a local vault; null for a linked one (the server holds it). */
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
   * their records, unsent changes and cursors, the vault list is replaced,
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
      const removed = cached.map((v) => v.vaultId).filter((id) => !current.has(id));

      await deleteVaultChanges(removed, tx);
      await deleteVaultRecords(removed, tx);
      await deleteSyncCursors(removed, tx);
      const vaultsChanged = !sameVaults(cached, vaults);
      if (vaultsChanged) await replaceVaults(vaults, tx);

      const pulled = records.filter((r) => current.has(r.vaultId));
      await rebasePendingVersions(pulled, tx, { resolve, receivedAt: serverTimestamp });
      await upsertRecords(pulled, tx);
      await setSyncCursors(
        Object.fromEntries(Object.entries(cursors).filter(([vaultId]) => current.has(vaultId))),
        tx,
      );
      return vaultsChanged;
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
      await clearProfileTable(tx);
    });
  }

  async destroy(): Promise<void> {
    await this.driver.destroy();
  }
}
