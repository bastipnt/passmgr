import type { LocalItem, StorageAdapter } from "./types";

export class LocalStore {
  constructor(private adapter: StorageAdapter) {}

  async getAllLatest(): Promise<LocalItem[]> {
    return this.adapter.getAllLatest();
  }

  async getByItemId(itemId: string): Promise<LocalItem | undefined> {
    return this.adapter.getByItemId(itemId);
  }

  async upsertItems(items: LocalItem[]): Promise<void> {
    if (items.length === 0) return;
    await this.adapter.upsertItems(items);
  }

  async getLastSyncTimestamp(): Promise<string | null> {
    return this.adapter.getLastSyncTimestamp();
  }

  async setLastSyncTimestamp(ts: string): Promise<void> {
    await this.adapter.setLastSyncTimestamp(ts);
  }

  async clear(): Promise<void> {
    await this.adapter.clear();
  }
}
