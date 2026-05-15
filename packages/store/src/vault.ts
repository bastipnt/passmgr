import { SQLocal } from "sqlocal";
import type { BiometricKeyMaterial } from "@repo/crypto";
import type { EncryptedRecordSchema, VaultKeyMaterial } from "@repo/schema";
import {
  clearRecordsTable,
  CREATE_RECORDS_SCHEMA_SQL,
  getAllRecordsLatest,
  getByRecordId,
  upsertRecords,
} from "./schema/records-schema";
import {
  clearBiometricKey,
  clearKeysTable,
  CREATE_KEYS_SCHEMA_SQL,
  getBiometricKey,
  getVaultKey,
  upsertBiometricVaultKey,
  upsertVaultKey,
} from "./schema/keys-schema";
import {
  clearSyncTable,
  CREATE_SYNC_META_SCHEMA_SQL,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
} from "./schema/sync-schema";

const SCHEMA_SQL = /* sql */ `
  ${CREATE_RECORDS_SCHEMA_SQL}
  ${CREATE_KEYS_SCHEMA_SQL}
  ${CREATE_SYNC_META_SCHEMA_SQL}
`;

export class Vault {
  private db: SQLocal;
  private initialized: Promise<void>;

  constructor(databasePath = "pass-mgr.sqlite3") {
    this.db = new SQLocal({
      databasePath,
    });

    this.initialized = this.init();
  }

  private async init(): Promise<void> {
    await this.db.exec(SCHEMA_SQL, []);
  }

  private async ready(): Promise<void> {
    await this.initialized;
  }

  /**
   * RECORDS
   */

  async upsertRecords(records: EncryptedRecordSchema[]): Promise<void> {
    await this.ready();
    await upsertRecords(records, this.db);
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
    await clearRecordsTable(this.db);
    await clearKeysTable(this.db);
    await clearSyncTable(this.db);
  }

  async destroy(): Promise<void> {
    await this.db.destroy();
  }
}
