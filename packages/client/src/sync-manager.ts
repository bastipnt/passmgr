import type { EncryptedRecordSchema, MemberVault } from "@repo/schema";
import type { ConflictResolver, PendingChange, SyncBatch, Vault } from "@repo/store";

/** Pull every vault's changes since its cursor (vaultId → cursor). */
export type SyncFetcher = (cursors: Record<string, number>) => Promise<SyncBatch>;

/**
 * Send one local change to the server. Resolves the server's copy of the
 * stored version (null when it returns none); throws when it wasn't stored.
 */
export type ChangePusher = (change: PendingChange) => Promise<EncryptedRecordSchema | null>;

/** Runs before the listeners when the vault list changed, e.g. to load new vault keys. */
export type VaultsChangedHandler = (vaults: MemberVault[]) => void | Promise<void>;

/** `vaultsChanged`: the vault list (membership, key wraps, metadata) changed in this pull. */
export type SyncListener = (event: { vaultsChanged: boolean }) => void;

type SyncManagerOptions = {
  pull: SyncFetcher;
  push?: ChangePusher;
  /**
   * Whether a push error concerns every change, not the one pushed (offline,
   * session rejected): the round stops there, and the change isn't counted as
   * failed. By default every error is the change's own.
   */
  stopsRound?: (error: unknown) => boolean;
  onVaultsChanged?: VaultsChangedHandler;
  /**
   * Merges a record edited both here and on the server (ADR 0001 D5). Without
   * one, the local edits only move above the server's and win as a whole.
   */
  resolveConflict?: ConflictResolver;
};

/**
 * One sync cycle (ADR 0001 D8): push the outbox in write order, then pull. A
 * change the server refused stays queued, and its record's later changes wait
 * behind it. When a push failed, the outbox is pushed once more after the
 * pull: a stale change (another device wrote first) goes through once the
 * pull has moved it above the server's versions and merged both sides.
 */
export class SyncManager {
  private syncing = false;
  private rerun = false;
  private enabled = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<SyncListener> = new Set();
  private store: Vault;
  private pull: SyncFetcher;
  private push?: ChangePusher;
  private stopsRound: (error: unknown) => boolean;
  private onVaultsChanged?: VaultsChangedHandler;
  private resolveConflict?: ConflictResolver;

  constructor(
    store: Vault,
    { pull, push, stopsRound = () => false, onVaultsChanged, resolveConflict }: SyncManagerOptions,
  ) {
    this.store = store;
    this.pull = pull;
    this.push = push;
    this.stopsRound = stopsRound;
    this.onVaultsChanged = onVaultsChanged;
    this.resolveConflict = resolveConflict;
  }

  /** Register a callback invoked after each successful sync. */
  onSync(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Whether `requestSync` may reach the server (a live server session, ADR 0001 D2). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Sync soon if there is a server to sync with, e.g. after a local write. */
  requestSync(): void {
    if (this.enabled) void this.sync();
  }

  /**
   * Push the outbox, then pull changes from the server into the local store.
   * Silently ignores network errors. A call while a sync runs schedules
   * another one right after it (if syncing is still enabled then), so a write
   * made meanwhile isn't left waiting.
   */
  async sync(): Promise<boolean> {
    if (this.syncing) {
      this.rerun = true;
      return false;
    }
    this.syncing = true;

    try {
      const pushed = await this.pushOutbox();

      const batch = await this.pull(await this.store.getSyncCursors());
      const vaultsChanged = await this.store.applySync(batch, this.resolveConflict);
      if (vaultsChanged) await this.onVaultsChanged?.(batch.vaults);

      if (!pushed) await this.pushOutbox();

      for (const listener of this.listeners) {
        listener({ vaultsChanged });
      }
      return true;
    } catch {
      // Network or server errors are expected when offline — silently skip.
      return false;
    } finally {
      this.syncing = false;
      // Not once disabled: locked or offline meanwhile, its pushes could only fail.
      if (this.rerun) {
        this.rerun = false;
        if (this.enabled) void this.sync();
      }
    }
  }

  /**
   * Push pending changes oldest first. Resolves whether every change was
   * stored. After a failure the record's later changes are held back: they
   * build on the failed one. Throws (ending the sync) on an error that stops
   * the round, or when a stored change can't be acknowledged locally.
   */
  private async pushOutbox(): Promise<boolean> {
    const push = this.push;
    if (!push) return true;

    const blocked = new Set<string>();
    for (const change of await this.store.getPendingChanges()) {
      const { recordId } = change.record;
      if (blocked.has(recordId)) continue;

      let stored: EncryptedRecordSchema | null;
      try {
        stored = await push(change);
      } catch (error) {
        if (this.stopsRound(error)) throw error;
        blocked.add(recordId);
        await this.store.failPendingChange(change.changeId, errorMessage(error));
        continue;
      }
      // The server has it: a failed local ack must not count as a failed push,
      // whose retry would store the change twice. It ends the sync instead.
      await this.store.ackPendingChange(change.changeId, stored);
    }
    return blocked.size === 0;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
