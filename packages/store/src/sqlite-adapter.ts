import { SQLocal } from "sqlocal";
// oxlint-disable-next-line import/default -- Vite ?worker import
import SQLocalWorker from "./workers/sqlocal.worker.ts?worker";
import type { BiometricKeyMaterial } from "@repo/crypto";
import type { EncryptedItemSchema } from "@repo/schema";

export type VaultKeyMaterial = {
  encryptedVaultKey: string;
  vaultKeyEncryptionNonce: string;
  passwordKekSalt: string;
  passwordKekParams: string; // JSON-encoded {t, m, p}
  email: string;
};

// TODO: separation between multiple users?
const SCHEMA_SQL = /* sql */ `
  CREATE TABLE IF NOT EXISTS items (
    itemId TEXT NOT NULL,
    encryptedData TEXT NOT NULL,
    encryptionNonce TEXT NOT NULL,
    cryptoVersion INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1,
    clientUpdatedAt TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT,
    PRIMARY KEY (itemId, version)
  );

  CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

export class SqliteAdapter {
  private db: SQLocal;
  private initialized: Promise<void>;

  constructor(databasePath = "pass-mgr.sqlite3") {
    this.db = new SQLocal({
      databasePath,
      processor: new SQLocalWorker(),
    });
    this.initialized = this.init();
  }

  private async init(): Promise<void> {
    await this.db.exec(SCHEMA_SQL, []);
  }

  private async ready(): Promise<void> {
    await this.initialized;
  }

  async upsertItems(items: EncryptedItemSchema[]): Promise<void> {
    await this.ready();
    if (items.length === 0) return;

    await this.db.transaction(async (tx) => {
      for (const item of items) {
        await tx.sql`
          INSERT OR REPLACE INTO items (
            itemId, encryptedData, encryptionNonce, cryptoVersion,
            version, clientUpdatedAt, created_at, updated_at, deleted_at
          ) VALUES (
            ${item.itemId}, ${item.encryptedData}, ${item.encryptionNonce}, ${item.cryptoVersion},
            ${item.version}, ${item.clientUpdatedAt}, ${item.created_at}, ${item.updated_at}, ${item.deleted_at}
          )
        `;
      }
    });
  }

  async getAllLatest(): Promise<EncryptedItemSchema[]> {
    await this.ready();
    return await this.db.sql<EncryptedItemSchema> /* sql */ `
      SELECT i.*
      FROM items i
      INNER JOIN (
        SELECT itemId, MAX(version) AS maxVersion
        FROM items
        GROUP BY itemId
      ) latest ON i.itemId = latest.itemId AND i.version = latest.maxVersion
      WHERE i.deleted_at IS NULL
    `;
  }

  async getByItemId(itemId: string): Promise<EncryptedItemSchema | undefined> {
    await this.ready();
    const rows = await this.db.sql<EncryptedItemSchema> /* sql */ `
      SELECT * FROM items
      WHERE itemId = ${itemId}
      ORDER BY version DESC
      LIMIT 1
    `;
    return rows[0];
  }

  async getLastSyncTimestamp(): Promise<string | null> {
    await this.ready();
    const rows = await this.db.sql<{ value: string }> /* sql */ `
      SELECT value FROM sync_meta WHERE key = 'lastSyncedAt'
    `;
    return rows[0]?.value ?? null;
  }

  async setLastSyncTimestamp(ts: string): Promise<void> {
    await this.ready();
    await this.db.sql`
      INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastSyncedAt', ${ts})
    `;
  }

  async setVaultKeyMaterial(material: VaultKeyMaterial): Promise<void> {
    await this.ready();
    await this.db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(material)) {
        await tx.sql`INSERT OR REPLACE INTO sync_meta (key, value) VALUES (${key}, ${value})`;
      }
    });
  }

  async getVaultKeyMaterial(): Promise<VaultKeyMaterial | null> {
    await this.ready();
    const rows = await this.db.sql<{ key: string; value: string }> /* sql */ `
      SELECT key, value FROM sync_meta
      WHERE key IN ('encryptedVaultKey', 'vaultKeyEncryptionNonce', 'passwordKekSalt', 'passwordKekParams', 'email')
    `;
    if (rows.length < 5) return null;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return map as VaultKeyMaterial;
  }

  private static readonly BIOMETRIC_KEYS = [
    "biometricEncryptedVaultKey",
    "biometricNonce",
    "credentialId",
    "prfSalt",
  ] as const;

  async setBiometricKeyMaterial(material: BiometricKeyMaterial): Promise<void> {
    await this.ready();
    await this.db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(material)) {
        await tx.sql`INSERT OR REPLACE INTO sync_meta (key, value) VALUES (${key}, ${value})`;
      }
    });
  }

  async getBiometricKeyMaterial(): Promise<BiometricKeyMaterial | null> {
    await this.ready();
    const keys = SqliteAdapter.BIOMETRIC_KEYS;
    const rows = await this.db.sql<{ key: string; value: string }> /* sql */ `
      SELECT key, value FROM sync_meta
      WHERE key IN (${keys[0]}, ${keys[1]}, ${keys[2]}, ${keys[3]})
    `;
    if (rows.length < 4) return null;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return map as BiometricKeyMaterial;
  }

  async clearBiometricKeyMaterial(): Promise<void> {
    await this.ready();
    const keys = SqliteAdapter.BIOMETRIC_KEYS;
    await this.db.sql`
      DELETE FROM sync_meta
      WHERE key IN (${keys[0]}, ${keys[1]}, ${keys[2]}, ${keys[3]})
    `;
  }

  async clear(): Promise<void> {
    await this.ready();
    await this.db.sql`DELETE FROM items`;
    await this.db.sql`DELETE FROM sync_meta`;
  }

  async destroy(): Promise<void> {
    await this.db.destroy();
  }
}
