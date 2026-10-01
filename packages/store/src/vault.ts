import type { BiometricKeyMaterial } from "@repo/crypto";
import type { AccountKeyMaterial, EncryptedRecordSchema, MemberVaultKey } from "@repo/schema";
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
  clearRecordsTable,
  getAllRecordsLatest,
  getByRecordId,
  upsertRecords,
} from "./schema/records-schema";
import { clearSyncTable, getLastSyncTimestamp, setLastSyncTimestamp } from "./schema/sync-schema";
import { clearVaultsTable, getVaultKeys, replaceVaultKeys } from "./schema/vaults-schema";

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
   * ACCOUNT KEY + VAULT KEYS (what an offline unlock needs)
   */

  /** Store the account key wrap and the vault key wraps together, atomically. */
  async setAccountKeyMaterial(
    material: AccountKeyMaterial,
    vaultKeys: readonly MemberVaultKey[],
  ): Promise<void> {
    await this.ready();
    await this.transaction(async (tx) => {
      await upsertAccountKey(material, tx);
      await replaceVaultKeys(vaultKeys, tx);
    });
  }

  async getAccountKeyMaterial(): Promise<AccountKeyMaterial | null> {
    await this.ready();
    return await getAccountKey(this.db);
  }

  async getVaultKeys(): Promise<MemberVaultKey[]> {
    await this.ready();
    return await getVaultKeys(this.db);
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
      await clearVaultsTable(tx);
    });
  }

  async destroy(): Promise<void> {
    await this.driver.destroy();
  }
}
