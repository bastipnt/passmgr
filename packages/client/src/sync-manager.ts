import { MAX_PUSH_CHANGES, type MemberVault, type PushChange, type PushResult } from "@repo/schema";
import type { ConflictResolver, PendingChange, SyncBatch, Vault } from "@repo/store";

/** Pull every vault's changes since its cursor (vaultId → cursor). */
export type SyncFetcher = (cursors: Record<string, number>) => Promise<SyncBatch>;

/**
 * Send a batch of local changes to the server (`record.push`). Resolves one
 * result per change; throws when the batch didn't get through.
 */
export type ChangePusher = (changes: PushChange[]) => Promise<PushResult[]>;

/** Runs before the listeners when the vault list changed, e.g. to load new vault keys. */
export type VaultsChangedHandler = (vaults: MemberVault[]) => void | Promise<void>;

/** `vaultsChanged`: the vault list (membership, key wraps, metadata) changed in this pull. */
export type SyncListener = (event: { vaultsChanged: boolean }) => void;

type SyncManagerOptions = {
  pull: SyncFetcher;
  push?: ChangePusher;
  /**
   * Whether a push error is about the round, not the batch (offline, session
   * rejected, server busy): the round stops there, and no change is counted as
   * failed. By default an error fails the batch's changes.
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
 * One sync cycle (ADR 0001 D8): push the outbox in batches, then pull. A
 * record's pending changes always go in one batch, which the server applies
 * all or nothing, so no other device pulls half of them (e.g. a losing edit
 * without the merge on top). A change that wasn't applied stays queued. When
 * one wasn't, the outbox is pushed once more after the pull: a stale change
 * (another device wrote first) goes through once the pull has moved it above
 * the server's versions and merged both sides.
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
   * Push the pending changes in batches. Resolves whether every change was
   * applied. Throws (ending the sync) on an error that stops the round, or
   * when an applied change can't be acknowledged locally.
   */
  private async pushOutbox(): Promise<boolean> {
    const push = this.push;
    if (!push) return true;

    let allApplied = true;
    for (const batch of pushBatches(await this.store.getPendingChanges())) {
      let results: PushResult[];
      try {
        results = await push(batch.map(toPushChange));
      } catch (error) {
        if (this.stopsRound(error)) throw error;
        allApplied = false;
        for (const { changeId } of batch) {
          await this.store.failPendingChange(changeId, errorMessage(error));
        }
        continue;
      }

      const byId = new Map(results.map((result) => [result.clientChangeId, result]));
      for (const { changeId } of batch) {
        const result = byId.get(changeId);
        if (result?.status === "applied") {
          // The server has it: a failed local ack must not count as a failed
          // push. It ends the sync instead; the retry gets the stored version.
          await this.store.ackPendingChange(changeId, result.record);
        } else {
          allApplied = false;
          await this.store.failPendingChange(changeId, failureMessage(result));
        }
      }
    }
    return allApplied;
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

/** A pending version as a push change: it builds on the version below it. */
export function toPushChange({ changeId, record }: PendingChange): PushChange {
  const common = {
    clientChangeId: changeId,
    recordId: record.recordId,
    vaultId: record.vaultId,
    baseVersion: record.version - 1,
    clientUpdatedAt: record.clientUpdatedAt,
  };
  if (record.deleted_at) return { ...common, op: "delete" };
  return {
    ...common,
    op: "put",
    encryptedData: record.encryptedData,
    encryptionNonce: record.encryptionNonce,
    cryptoVersion: record.cryptoVersion,
  };
}

/**
 * Split pending changes into push batches, keeping each record's changes
 * together and in order. Only a chain longer than a batch is split.
 */
export function pushBatches(
  changes: readonly PendingChange[],
  max = MAX_PUSH_CHANGES,
): PendingChange[][] {
  const chains = new Map<string, PendingChange[]>();
  for (const change of changes) {
    const chain = chains.get(change.record.recordId);
    if (chain) chain.push(change);
    else chains.set(change.record.recordId, [change]);
  }

  const batches: PendingChange[][] = [];
  let batch: PendingChange[] = [];
  for (const chain of chains.values()) {
    for (let i = 0; i < chain.length; i += max) {
      const piece = chain.slice(i, i + max);
      if (batch.length + piece.length > max) {
        batches.push(batch);
        batch = [];
      }
      batch.push(...piece);
    }
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

function failureMessage(result: Exclude<PushResult, { status: "applied" }> | undefined): string {
  if (!result) return "no answer from the server";
  if (result.status === "stale") return `stale: the server is at version ${result.headVersion}`;
  return `rejected: ${result.reason}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
