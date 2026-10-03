import type { MemberVault } from "@repo/schema";
import type { SyncBatch, Vault } from "@repo/store";

/** Pull every vault's changes since its cursor (vaultId → cursor). */
export type SyncFetcher = (cursors: Record<string, string>) => Promise<SyncBatch>;

/** Runs before the listeners when the vault list changed, e.g. to load new vault keys. */
export type VaultsChangedHandler = (vaults: MemberVault[]) => void | Promise<void>;

/** `vaultsChanged`: the vault list (membership, key wraps, metadata) changed in this pull. */
export type SyncListener = (event: { vaultsChanged: boolean }) => void;

export class SyncManager {
  private syncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<SyncListener> = new Set();
  private store: Vault;
  private fetcher: SyncFetcher;
  private onVaultsChanged?: VaultsChangedHandler;

  constructor(store: Vault, fetcher: SyncFetcher, onVaultsChanged?: VaultsChangedHandler) {
    this.store = store;
    this.fetcher = fetcher;
    this.onVaultsChanged = onVaultsChanged;
  }

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
      const batch = await this.fetcher(await this.store.getSyncCursors());
      const vaultsChanged = await this.store.applySync(batch);
      if (vaultsChanged) await this.onVaultsChanged?.(batch.vaults);

      for (const listener of this.listeners) {
        listener({ vaultsChanged });
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
