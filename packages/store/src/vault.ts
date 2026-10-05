import type { BiometricKeyMaterial } from "@repo/crypto";
import type { AccountKeyMaterial, EncryptedRecordSchema, MemberVault } from "@repo/schema";
import type { SqlDriver } from "./driver";
import { createLocalDb, type LocalDb } from "./local-db";
import { migrate } from "./migrations";
import {
  clearBiometricKey,
  clearKeysTable,
  getAccountKey,
  getBiometricKey,
  upsertAccountKey,
  upsertBiometricKey,
} from "./schema/keys-schema";
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
import { clearVaultsTable, getVaults, replaceVaults } from "./schema/vaults-schema";

/** One pull from the server: changed records plus the full list of the user's vaults. */
export type SyncBatch = {
  records: EncryptedRecordSchema[];
  vaults: MemberVault[];
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

  async upsertRecords(records: EncryptedRecordSchema[]): Promise<void> {
    await this.ready();
    if (records.length === 0) return;
    await this.transaction((tx) => upsertRecords(records, tx));
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
  async getSyncCursors(): Promise<Record<string, string>> {
    await this.ready();
    return await getSyncCursors(this.db);
  }

  /**
   * Apply one pull atomically: vaults the user lost access to are dropped with
   * their records and cursors, the vault list is replaced, records upserted and
   * every vault's cursor advanced. Resolves whether the vault list changed (the
   * keys in memory then need reloading).
   */
  async applySync({ records, vaults, serverTimestamp }: SyncBatch): Promise<boolean> {
    await this.ready();
    return await this.transaction(async (tx) => {
      const cached = await getVaults(tx);
      const current = new Set(vaults.map((v) => v.vaultId));
      const removed = cached.map((v) => v.vaultId).filter((id) => !current.has(id));

      await deleteVaultRecords(removed, tx);
      await deleteSyncCursors(removed, tx);
      const vaultsChanged = !sameVaults(cached, vaults);
      if (vaultsChanged) await replaceVaults(vaults, tx);

      await upsertRecords(
        records.filter((r) => current.has(r.vaultId)),
        tx,
      );
      await setSyncCursors([...current], serverTimestamp, tx);
      return vaultsChanged;
    });
  }

  /**
   * CLEANUP
   */

  async clear(): Promise<void> {
    await this.ready();
    await this.transaction(async (tx) => {
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
