import { MAX_PUSH_CHANGES, type MemberVault, type PushChange, type PushResult } from "@repo/schema";
import type { ConflictResolver, PendingChange, SyncBatch, Vault } from "@repo/store";

/** One page of a pull; `hasMore`: the server has more changes past its cursors. */
export type SyncPage = SyncBatch & { hasMore: boolean };

/** Pull a page of every vault's changes since its cursor (vaultId → cursor). */
export type SyncFetcher = (cursors: Record<string, number>) => Promise<SyncPage>;

/**
 * Send a batch of local changes to the server (`record.push`). Resolves one
 * result per change; throws when the batch didn't get through.
 */
export type ChangePusher = (changes: PushChange[]) => Promise<PushResult[]>;

/** Runs before the listeners when the vault list changed, e.g. to load new vault keys. */
export type VaultsChangedHandler = (vaults: MemberVault[]) => void | Promise<void>;

/** `vaultsChanged`: the vault list (membership, key wraps, metadata) changed since the last event. */
export type SyncListener = (event: { vaultsChanged: boolean }) => void;

/**
 * Where syncing stands (ADR 0001 D8). `offline`: no server to sync with right
 * now (disabled: offline, locked, a `local` profile; or a round that didn't get
 * through). `idle` with `pending > 0` is "n changes waiting", retried with backoff.
 */
export type SyncStatus = {
  phase: "idle" | "syncing" | "error" | "offline";
  /** Local changes the server doesn't have yet, parked ones included. */
  pending: number;
  /** Changes that kept failing or were rejected: not pushed again until `retryParked`. */
  parked: number;
  /** Why the last round failed (`error` phase). */
  error: string | null;
  /** When a round last went through (ms since epoch). */
  lastSyncedAt: number | null;
};

export type SyncStatusListener = (status: SyncStatus) => void;

/** A change failing this many pushes is parked instead of retried forever. */
export const MAX_PUSH_ATTEMPTS = 8;

const WRITE_DEBOUNCE_MS = 750;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;

type SyncManagerOptions = {
  pull: SyncFetcher;
  push?: ChangePusher;
  /**
   * Whether a push error is about the round, not the batch (offline, session
   * rejected, server busy): the round stops there, and no change is counted as
   * failed. By default an error fails the batch's changes.
   */
  stopsRound?: (error: unknown) => boolean;
  /** Whether a failed round means "offline" rather than "error" in the status. */
  isOffline?: (error: unknown) => boolean;
  onVaultsChanged?: VaultsChangedHandler;
  /**
   * Merges a record edited both here and on the server (ADR 0001 D5). Without
   * one, the local edits only move above the server's and win as a whole.
   */
  resolveConflict?: ConflictResolver;
};

/**
 * One sync cycle (ADR 0001 D8): push the outbox in batches, then pull page by page. A
 * record's pending changes always go in one batch, which the server applies
 * all or nothing, so no other device pulls half of them (e.g. a losing edit
 * without the merge on top). A change that wasn't applied stays queued. When
 * one wasn't, the outbox is pushed once more after the pull: a stale change
 * (another device wrote first) goes through once the pull has moved it above
 * the server's versions and merged both sides.
 *
 * A round that fails, or leaves changes queued, is retried with exponential
 * backoff while enabled. A change failing `MAX_PUSH_ATTEMPTS` pushes (a stale
 * answer doesn't count: the pull resolves it), or rejected by the server, is parked: it and its record's later changes stay
 * local until `retryParked`, so they don't hold up the rest of the outbox.
 */
export class SyncManager {
  private syncing = false;
  /** The running round, for `dispose` to wait on. */
  private round: Promise<boolean> | null = null;
  private disposed = false;
  private rerun = false;
  private enabled = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private failedRounds = 0;
  private listeners: Set<SyncListener> = new Set();
  private statusListeners: Set<SyncStatusListener> = new Set();
  private status: SyncStatus = {
    phase: "offline",
    pending: 0,
    parked: 0,
    error: null,
    lastSyncedAt: null,
  };
  private store: Vault;
  private pull: SyncFetcher;
  private push?: ChangePusher;
  private stopsRound: (error: unknown) => boolean;
  private isOffline: (error: unknown) => boolean;
  private onVaultsChanged?: VaultsChangedHandler;
  private resolveConflict?: ConflictResolver;

  constructor(
    store: Vault,
    {
      pull,
      push,
      stopsRound = () => false,
      isOffline = () => false,
      onVaultsChanged,
      resolveConflict,
    }: SyncManagerOptions,
  ) {
    this.store = store;
    this.pull = pull;
    this.push = push;
    this.stopsRound = stopsRound;
    this.isOffline = isOffline;
    this.onVaultsChanged = onVaultsChanged;
    this.resolveConflict = resolveConflict;
  }

  /** Register a callback invoked after each successful sync and each pulled page before its last. */
  onSync(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The current sync status; a new object whenever it changes. */
  getStatus(): SyncStatus {
    return this.status;
  }

  /** Register a callback invoked whenever the sync status changes. */
  onStatusChange(listener: SyncStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * Whether `requestSync` and retries may reach the server (a live server
   * session, ADR 0001 D2). Disabling drops scheduled syncs.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearTimers();
      this.failedRounds = 0;
    }
    this.setStatus({ phase: enabled ? "idle" : "offline", error: null });
    void this.refreshCounts();
  }

  /**
   * Sync shortly if there is a server to sync with, e.g. after a local write.
   * Writes in quick succession share one sync.
   */
  requestSync(): void {
    void this.refreshCounts();
    if (!this.enabled) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.enabled) void this.sync();
    }, WRITE_DEBOUNCE_MS);
  }

  /** Queue the parked changes again and sync. */
  async retryParked(): Promise<void> {
    await this.store.retryParkedChanges();
    await this.refreshCounts();
    if (this.enabled) void this.sync();
  }

  /**
   * Push the outbox, then pull changes from the server into the local store.
   * Resolves whether the round went through; a failure shows in the status and,
   * while enabled, is retried with backoff. A call while a sync runs schedules
   * another one right after it (if syncing is still enabled then), so a write
   * made meanwhile isn't left waiting.
   */
  async sync(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.syncing) {
      this.rerun = true;
      return false;
    }
    const round = this.runRound();
    this.round = round;
    return await round;
  }

  private async runRound(): Promise<boolean> {
    this.syncing = true;
    this.setStatus({ phase: "syncing" });

    let done = false;
    try {
      let pushed = await this.pushOutbox();

      const vaultsChanged = await this.pullAll();

      if (!pushed) pushed = await this.pushOutbox();
      done = pushed;

      this.notify(vaultsChanged);
      this.setStatus({
        phase: this.enabled ? "idle" : "offline",
        error: null,
        lastSyncedAt: Date.now(),
      });
      return true;
    } catch (error) {
      const offline = !this.enabled || this.isOffline(error);
      this.setStatus({
        phase: offline ? "offline" : "error",
        error: offline ? null : errorMessage(error),
      });
      return false;
    } finally {
      this.syncing = false;
      await this.refreshCounts();
      if (done) this.clearRetry();
      else this.scheduleRetry();
      // Not once disabled: locked or offline meanwhile, its pushes could only fail.
      if (this.rerun) {
        this.rerun = false;
        if (this.enabled) void this.sync();
      }
    }
  }

  /**
   * Pull and apply pages until the server has no more. Each page is applied
   * (and its cursors stored) on its own, so a round that fails midway resumes
   * from the last page applied; listeners hear of every page but the last
   * right away (the round reports that one). Throws when a page that claims
   * more moved no cursor: pulling again would loop. Resolves whether the last
   * page changed the vault list.
   */
  private async pullAll(): Promise<boolean> {
    let cursors = await this.store.getSyncCursors();
    for (;;) {
      const page = await this.pull(cursors);
      const vaultsChanged = await this.store.applySync(page, this.resolveConflict);
      // Keys first: the next page's merges may need a vault this one added.
      if (vaultsChanged) await this.onVaultsChanged?.(page.vaults);
      if (!page.hasMore) return vaultsChanged;
      // Disposed (another profile opened): the next round resumes from this cursor.
      if (this.disposed) throw new Error("sync stopped");

      const next = await this.store.getSyncCursors();
      if (!advanced(cursors, next)) throw new Error("the pull made no progress");
      cursors = next;
      this.notify(vaultsChanged);
    }
  }

  private notify(vaultsChanged: boolean): void {
    for (const listener of this.listeners) listener({ vaultsChanged });
  }

  /**
   * Push the pending changes in batches, except parked ones and whatever their
   * records wrote after them. Resolves whether every pushed change was applied.
   * Throws (ending the sync) on an error that stops the round, or when an
   * applied change can't be acknowledged locally.
   */
  private async pushOutbox(): Promise<boolean> {
    if (!this.push) return true;

    const changes = await this.store.getPendingChanges();
    const held = new Set(changes.filter((c) => c.parkedAt).map((c) => c.record.recordId));
    const failed = new Set<string>();
    for (const batch of pushBatches(changes.filter((c) => !held.has(c.record.recordId)))) {
      // The rest of a chain too long for one batch builds on what failed.
      const rest = batch.filter((c) => !failed.has(c.record.recordId));
      if (rest.length > 0) await this.pushBatch(rest, failed);
    }
    return failed.size === 0;
  }

  /**
   * Push one batch and apply the results, adding the records with a change
   * that wasn't applied to `failed`. A batch the server refuses as a whole
   * (e.g. one malformed change) is split by record, down to the record whose
   * changes it refuses, so one bad change doesn't block the others.
   */
  private async pushBatch(batch: PendingChange[], failed: Set<string>): Promise<void> {
    let results: PushResult[];
    try {
      results = await this.push!(batch.map(toPushChange));
    } catch (error) {
      if (this.stopsRound(error)) throw error;
      const chains = [...groupChains(batch).values()];
      if (chains.length > 1) {
        const half = Math.ceil(chains.length / 2);
        await this.pushBatch(chains.slice(0, half).flat(), failed);
        await this.pushBatch(chains.slice(half).flat(), failed);
        return;
      }
      for (const change of batch) await this.fail(change, errorMessage(error));
      failed.add(batch[0]!.record.recordId);
      return;
    }

    const byId = new Map(results.map((result) => [result.clientChangeId, result]));
    for (const change of batch) {
      const result = byId.get(change.changeId);
      if (result?.status === "applied") {
        // The server has it: a failed local ack must not count as a failed
        // push. It ends the sync instead; the retry gets the stored version.
        await this.store.ackPendingChange(change.changeId, result.record);
        continue;
      }
      failed.add(change.record.recordId);
      if (result?.status === "rejected") {
        // Not found or forbidden (e.g. access revoked): a retry can't change that.
        await this.store.parkPendingChange(change.changeId, failureMessage(result));
      } else if (result?.status === "stale") {
        // Another device wrote first: the pull merges it, so it never counts.
        await this.store.failPendingChange(change.changeId, failureMessage(result), {
          count: false,
        });
      } else {
        await this.fail(change, failureMessage(result));
      }
    }
  }

  /** Count a failed push, parking the change once it has failed too often. */
  private async fail(change: PendingChange, message: string): Promise<void> {
    if (change.attempts + 1 >= MAX_PUSH_ATTEMPTS) {
      await this.store.parkPendingChange(change.changeId, message);
    } else {
      await this.store.failPendingChange(change.changeId, message);
    }
  }

  private scheduleRetry(): void {
    if (!this.enabled || this.retryTimer) return;
    const delay = Math.min(RETRY_BASE_MS * 2 ** this.failedRounds, RETRY_MAX_MS);
    this.failedRounds++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.enabled) void this.sync();
    }, delay);
  }

  private clearRetry(): void {
    this.failedRounds = 0;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private clearTimers(): void {
    this.clearRetry();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  }

  /** Re-count the outbox for the status; a failed count keeps the last one. */
  private async refreshCounts(): Promise<void> {
    try {
      const [pending, parked] = await Promise.all([
        this.store.countPendingChanges(),
        this.store.countParkedChanges(),
      ]);
      this.setStatus({ pending, parked });
    } catch (error) {
      console.warn("Cannot count the pending changes", error);
    }
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    const next = { ...this.status, ...patch };
    const keys = Object.keys(next) as (keyof SyncStatus)[];
    if (keys.every((key) => next[key] === this.status[key])) return;
    this.status = next;
    for (const listener of this.statusListeners) listener(next);
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

  /**
   * Stop for good: no timers, no listeners, no new rounds. Resolves once a
   * round still running has ended, so its store can be closed after.
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    this.stopPeriodicSync();
    this.clearTimers();
    this.enabled = false;
    this.setStatus({ phase: "offline" });
    this.listeners.clear();
    this.statusListeners.clear();
    await this.round?.catch(() => undefined);
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
  const batches: PendingChange[][] = [];
  let batch: PendingChange[] = [];
  for (const chain of groupChains(changes).values()) {
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

/** Whether some vault's cursor moved forward (a vault without one is at 0). */
function advanced(before: Record<string, number>, after: Record<string, number>): boolean {
  return Object.entries(after).some(([vaultId, cursor]) => cursor > (before[vaultId] ?? 0));
}

/** Each record's changes, in order, by record id. */
function groupChains(changes: readonly PendingChange[]): Map<string, PendingChange[]> {
  const chains = new Map<string, PendingChange[]>();
  for (const change of changes) {
    const chain = chains.get(change.record.recordId);
    if (chain) chain.push(change);
    else chains.set(change.record.recordId, [change]);
  }
  return chains;
}

function failureMessage(result: Exclude<PushResult, { status: "applied" }> | undefined): string {
  if (!result) return "no answer from the server";
  if (result.status === "stale") return `stale: the server is at version ${result.headVersion}`;
  return `rejected: ${result.reason}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
