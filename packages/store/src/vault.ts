import type { BiometricKeyMaterial } from "@repo/crypto";
import type { EncryptedRecordSchema, VaultKeyMaterial } from "@repo/schema";
import type { SqlDriver } from "./driver";
import { createLocalDb, type LocalDb } from "./local-db";
import { migrate } from "./migrations";
import {
  clearBiometricKey,
  clearKeysTable,
  getBiometricKey,
  getVaultKey,
  upsertBiometricVaultKey,
  upsertVaultKey,
} from "./schema/keys-schema";
import {
  clearRecordsTable,
  getAllRecordsLatest,
  getByRecordId,
  upsertRecords,
} from "./schema/records-schema";
import { clearSyncTable, getLastSyncTimestamp, setLastSyncTimestamp } from "./schema/sync-schema";

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

  async getAllLatest(): Promise<EncryptedRecordSchema[]> {
    await this.ready();
    return await getAllRecordsLatest(this.db);
  }

  async getByRecordId(recordId: string): Promise<EncryptedRecordSchema | undefined> {
    await this.ready();
    return await getByRecordId(recordId, this.db);
  }

  /**
   * VAULT KEY
   */

  async setVaultKeyMaterial(vaultKey: VaultKeyMaterial): Promise<void> {
    await this.ready();
    await upsertVaultKey(vaultKey, this.db);
  }

  async getVaultKeyMaterial(): Promise<VaultKeyMaterial | null> {
    await this.ready();
    return await getVaultKey(this.db);
  }

  /**
   * BIOMETRIC KEY
   */

  async setBiometricKeyMaterial(biometricKey: BiometricKeyMaterial): Promise<void> {
    await this.ready();
    await upsertBiometricVaultKey(biometricKey, this.db);
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

  async getLastSyncTimestamp(): Promise<string | null> {
    await this.ready();
    return await getLastSyncTimestamp(this.db);
  }

  async setLastSyncTimestamp(ts: string): Promise<void> {
    await this.ready();
    await setLastSyncTimestamp(ts, this.db);
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
    });
  }

  async destroy(): Promise<void> {
    await this.driver.destroy();
  }
}
