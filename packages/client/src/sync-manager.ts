import type { LocalItem, LocalStore } from "@repo/store";

export type SyncFetcher = (lastSyncedAt?: string) => Promise<{
  items: LocalItem[];
  serverTimestamp: string;
}>;

export type SyncListener = () => void;

export class SyncManager {
  private syncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<SyncListener> = new Set();

  constructor(
    private store: LocalStore,
    private fetcher: SyncFetcher,
  ) {}

  /** Register a callback invoked after each successful sync. */
  onSync(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Pull changes from server and write to local store. Silently ignores network errors. */
  async sync(): Promise<boolean> {
    if (this.syncing) return false;
    this.syncing = true;

    try {
      const lastSyncedAt = (await this.store.getLastSyncTimestamp()) ?? undefined;
      const { items, serverTimestamp } = await this.fetcher(lastSyncedAt);

      if (items.length > 0) {
        await this.store.upsertItems(items);
      }
      await this.store.setLastSyncTimestamp(serverTimestamp);

      for (const listener of this.listeners) {
        listener();
      }
      return true;
    } catch {
      // Network or server errors are expected when offline — silently skip.
      return false;
    } finally {
      this.syncing = false;
    }
  }

  /** Start periodic background sync. */
  startPeriodicSync(intervalMs = 60_000): void {
    this.stopPeriodicSync();
    this.syncInterval = setInterval(() => {
      this.sync().catch(console.error);
    }, intervalMs);
  }

  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  dispose(): void {
    this.stopPeriodicSync();
    this.listeners.clear();
  }
}
