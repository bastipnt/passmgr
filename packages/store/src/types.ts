export type LocalItem = {
  itemId: string;
  encryptedData: string;
  encryptionNonce: string;
  cryptoVersion: number;
  version: number;
  clientUpdatedAt: string;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

export interface StorageAdapter {
  /** Insert or replace item rows (by itemId + version). */
  upsertItems(items: LocalItem[]): Promise<void>;

  /** Get latest version per itemId, excluding soft-deleted. */
  getAllLatest(): Promise<LocalItem[]>;

  /** Get latest version of a single item (even if deleted). */
  getByItemId(itemId: string): Promise<LocalItem | undefined>;

  /** Sync metadata */
  getLastSyncTimestamp(): Promise<string | null>;
  setLastSyncTimestamp(ts: string): Promise<void>;

  /** Clear all data (on logout). */
  clear(): Promise<void>;
}
