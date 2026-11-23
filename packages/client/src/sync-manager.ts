import {
  type EncryptedRecordSchema,
  MAX_PURGE_SEAL_LENGTH,
  MAX_PUSH_BYTES,
  MAX_PUSH_CHANGES,
  type MemberVault,
  type PushChange,
  type PushResult,
  pushChangeBytes,
  type VaultKeyUpdate,
} from "@repo/schema";
import {
  type ConflictResolver,
  type PendingChange,
  type RecordContent,
  type SyncBatch,
  sameVaults,
  secretsStore,
  type Vault,
  VaultListRejectedError,
  VaultsMissingError,
} from "@repo/store";
import { logError, logWarning } from "@repo/util";

/**
 * One page of a pull; `hasMore`: the server has more changes past its cursors.
 * Every page carries the sharing tasks in full (ADR 0001 D7).
 */
export type SyncPage = SyncBatch & {
  hasMore: boolean;
  keyUpdates?: VaultKeyUpdate[];
  rotationsDue?: string[];
};

/**
 * Accept newer vault keys sealed to the user, rotate vaults that lost a member
 * (`runSharingTasks`). Resolves whether the server changed: the round runs again.
 */
export type SharingTasksHandler = (tasks: {
  keyUpdates: VaultKeyUpdate[];
  rotationsDue: string[];
}) => Promise<SharingTasksResult>;

/**
 * `changed`: the server changed, the round runs again. `rotationsPending`: the
 * vaults whose due rotation didn't go through here (`SyncStatus.rotationsPending`).
 */
export type SharingTasksResult = { changed: boolean; rotationsPending: readonly string[] };

/** Pull a page of every vault's changes since its cursor (vaultId → cursor). */
export type SyncFetcher = (cursors: Record<string, number>) => Promise<SyncPage>;

/**
 * Send a batch of local changes to the server (`record.push`). Resolves one
 * result per change; throws when the batch didn't get through.
 */
export type ChangePusher = (changes: PushChange[]) => Promise<PushResult[]>;

/**
 * Runs when a pulled vault list differs from the device's, before the page is
 * applied (its merges may need a key it brings) and before the listeners. A
 * throw fails the round without applying the page.
 */
export type VaultsChangedHandler = (vaults: MemberVault[]) => void | Promise<void>;

/**
 * The vault keys' part of a sync (ADR 0001 D11): seal each pending version for
 * the server once its number is final, and check what the server sends (pulled
 * rows, push answers) with the same keys.
 */
export type RecordSealer = {
  sealRecord(row: EncryptedRecordSchema): RecordContent | null;
  /** Whether the key a row is under is loaded: one that isn't can't be checked yet. */
  hasRecordKey(row: EncryptedRecordSchema): boolean;
  /** Whether a vault member sealed the row for its slot, key version and state. */
  isSealedRow(row: EncryptedRecordSchema): boolean;
  /** Whether a sealed row (a retry's answer) holds what a pending draft does. */
  sameRecordContent(sealed: EncryptedRecordSchema, draft: EncryptedRecordSchema): boolean;
};

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
  /**
   * A change was parked in this session (not counted across restarts) because
   * the vault owner's storage is full, until `retryParked`.
   */
  storageFull: boolean;
  /** Why the last round failed (`error` phase). */
  error: string | null;
  /** When a round last went through (ms since epoch). */
  lastSyncedAt: number | null;
  /**
   * Whether syncing may reach the server (`setEnabled`). `offline` while
   * enabled: a round didn't get through; while not: not started yet, or locked.
   */
  enabled: boolean;
  /**
   * The server refuses to sync this account until something is done on it
   * (`isPaused`: its email isn't verified). No retries and no syncs on
   * writes; the periodic sync still checks, or a call to `sync`.
   */
  paused: boolean;
  /**
   * Vaults the server stopped listing, several at once (`VaultsMissingError`):
   * kept on the device until the user confirms dropping them (`confirmVaultLoss`).
   */
  vaultsMissing: readonly string[];
  /** The server's vault list broke continuity (`VaultListRejectedError`): nothing of it was applied. */
  vaultListRejected: boolean;
  /**
   * Vaults whose key rotation isn't done: the server still asks for one (a
   * member left) that failed here, or this device's rotation still has records
   * to re-encrypt. Until then a removed member can read what is written. Set
   * by each round that goes through. A rotation that failed isn't retried before
   * the failed task is reset (`resetSharingTasks`, e.g. after verifying a member).
   */
  rotationsPending: readonly string[];
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
  /** Whether a failed round means the server won't sync this account for now (`paused`). */
  isPaused?: (error: unknown) => boolean;
  onVaultsChanged?: VaultsChangedHandler;
  /**
   * Merges a record edited both here and on the server (ADR 0001 D5). Without
   * one, the local edits only move above the server's and win as a whole.
   */
  resolveConflict?: ConflictResolver;
  /**
   * Runs before each push of the outbox, e.g. to re-encrypt changes written
   * under a vault key that was rotated meanwhile. A failure doesn't stop the
   * push: whatever wasn't prepared is answered by the server as before.
   * Resolves the vaults whose re-encryption isn't done (`rotationsPending`).
   */
  prepareOutbox?: () => Promise<readonly string[] | void>;
  /**
   * Runs after a round that went through when its pull asked for sharing work.
   * A failure doesn't fail the round.
   */
  onSharingTasks?: SharingTasksHandler;
  /** The vault keys (`secretsStore` by default). */
  sealer?: RecordSealer;
};

/**
 * A record's pending changes always go in one batch, which the server applies all or nothing; the
 * round, retries and parking: see docs/architecture/vaults-and-sync.md (ADR 0001 D8).
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
    storageFull: false,
    error: null,
    lastSyncedAt: null,
    enabled: false,
    paused: false,
    vaultsMissing: [],
    vaultListRejected: false,
    rotationsPending: [],
  };
  /** Vaults the user agreed to drop (`confirmVaultLoss`), until a round goes through. */
  private allowedVaultLoss: readonly string[] = [];
  private store: Vault;
  private pull: SyncFetcher;
  private push?: ChangePusher;
  private stopsRound: (error: unknown) => boolean;
  private isOffline: (error: unknown) => boolean;
  private isPaused: (error: unknown) => boolean;
  private onVaultsChanged?: VaultsChangedHandler;
  private resolveConflict?: ConflictResolver;
  private prepareOutbox?: () => Promise<readonly string[] | void>;
  /** From the last outbox preparation and sharing tasks (`SyncStatus.rotationsPending`). */
  private reencryptPending: readonly string[] = [];
  private sharingRotationsPending: readonly string[] = [];
  private onSharingTasks?: SharingTasksHandler;
  private sealer: RecordSealer;
  /** The round's pull held back a vault whose key isn't loaded yet: the round isn't done. */
  private pullHeldBack = false;
  /** What the last pull asked for (`onSharingTasks`). */
  private sharingTasks: { keyUpdates: VaultKeyUpdate[]; rotationsDue: string[] } = {
    keyUpdates: [],
    rotationsDue: [],
  };

  constructor(
    store: Vault,
    {
      pull,
      push,
      stopsRound = () => false,
      isOffline = () => false,
      isPaused = () => false,
      onVaultsChanged,
      resolveConflict,
      prepareOutbox,
      onSharingTasks,
      sealer = secretsStore,
    }: SyncManagerOptions,
  ) {
    this.store = store;
    this.pull = pull;
    this.push = push;
    this.stopsRound = stopsRound;
    this.isOffline = isOffline;
    this.isPaused = isPaused;
    this.onVaultsChanged = onVaultsChanged;
    this.resolveConflict = resolveConflict;
    this.prepareOutbox = prepareOutbox;
    this.onSharingTasks = onSharingTasks;
    this.sealer = sealer;
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
      this.allowedVaultLoss = [];
    }
    this.setStatus({
      phase: enabled ? "idle" : "offline",
      error: null,
      enabled,
      paused: false,
      vaultsMissing: [],
      vaultListRejected: false,
    });
    void this.refreshCounts();
  }

  /**
   * Sync shortly if there is a server to sync with, e.g. after a local write.
   * Writes in quick succession share one sync.
   */
  requestSync(): void {
    void this.refreshCounts();
    if (!this.enabled || this.status.paused) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.enabled) void this.sync();
    }, WRITE_DEBOUNCE_MS);
  }

  /** Queue the parked changes again and sync. */
  async retryParked(): Promise<void> {
    await this.store.retryParkedChanges();
    this.setStatus({ storageFull: false });
    await this.refreshCounts();
    if (this.enabled) void this.sync();
  }

  /** Drop the vaults the server stopped listing (`vaultsMissing`) with the next round. */
  async confirmVaultLoss(): Promise<boolean> {
    this.allowedVaultLoss = this.status.vaultsMissing;
    this.setStatus({ vaultsMissing: [] });
    return await this.syncFresh();
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

  /**
   * Sync with a round that starts after this call: wait out the running one
   * (and any rerun it chains) first. For a change made on the server directly
   * (a new vault): a round already under way may have pulled before it, and
   * resolving with that one would apply a vault list without it.
   */
  async syncFresh(): Promise<boolean> {
    // `runRound` never rejects. A rerun starts inside a round's `finally`,
    // before that round resolves, so `syncing` is current after every await.
    while (this.syncing && this.round) await this.round;
    return await this.sync();
  }

  private async runRound(): Promise<boolean> {
    this.syncing = true;
    this.setStatus({ phase: "syncing" });

    let done = false;
    let paused = false;
    this.pullHeldBack = false;
    try {
      let pushed = await this.pushOutbox();

      const vaultsChanged = await this.pullAll();

      if (!pushed) pushed = await this.pushOutbox();
      // A held-back vault waits for its key (the sharing tasks below): retried.
      done = pushed && !this.pullHeldBack;

      this.allowedVaultLoss = [];
      this.notify(vaultsChanged);
      this.setStatus({
        phase: this.enabled ? "idle" : "offline",
        error: null,
        lastSyncedAt: Date.now(),
        paused: false,
        vaultsMissing: [],
        vaultListRejected: false,
      });
      await this.runSharingTasks();
      this.setStatus({
        rotationsPending: sameList(
          [...new Set([...this.sharingRotationsPending, ...this.reencryptPending])],
          this.status.rotationsPending,
        ),
      });
      return true;
    } catch (error) {
      paused = this.isPaused(error);
      const refused =
        error instanceof VaultsMissingError || error instanceof VaultListRejectedError;
      const offline = !this.enabled || paused || (!refused && this.isOffline(error));
      this.setStatus({
        phase: offline ? "offline" : "error",
        error: offline ? null : errorMessage(error),
        paused,
        vaultsMissing: error instanceof VaultsMissingError ? error.vaultIds : [],
        vaultListRejected: error instanceof VaultListRejectedError,
      });
      return false;
    } finally {
      this.syncing = false;
      await this.refreshCounts();
      if (done || paused) this.clearRetry();
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
   * right away (the round reports that one). A page that claims more but
   * moved no cursor ends the pull when a vault was held back (its key comes
   * with the sharing tasks after the pull; the round is retried), and throws
   * otherwise: pulling again would loop. Resolves whether the last page
   * changed the vault list.
   */
  private async pullAll(): Promise<boolean> {
    let cursors = await this.store.getSyncCursors();
    for (;;) {
      const before = await this.store.getVaults();
      const page = await this.pull(cursors);
      const vaultsChanged = await this.applyPage(page, before);
      this.sharingTasks = {
        keyUpdates: page.keyUpdates ?? [],
        rotationsDue: page.rotationsDue ?? [],
      };
      if (!page.hasMore) return vaultsChanged;
      // Disposed (another profile opened): the next round resumes from this cursor.
      if (this.disposed) throw new Error("sync stopped");

      const next = await this.store.getSyncCursors();
      if (!advanced(cursors, next)) {
        if (this.pullHeldBack) return vaultsChanged;
        throw new Error("the pull made no progress");
      }
      cursors = next;
      this.notify(vaultsChanged);
    }
  }

  /**
   * Check the page's vault list, load its keys (when it changed) and apply it.
   * A list refused because this device moved a vault on during the pull (a
   * rotation raised its key version) is a stale page, not a hostile server:
   * the round fails quietly and runs again. Keys loaded for a page that then
   * didn't apply are swapped back for the stored list's.
   */
  private async applyPage(page: SyncPage, before: MemberVault[]): Promise<boolean> {
    const allowVaultLoss = this.allowedVaultLoss;
    const onVaultsChanged = sameVaults(await this.store.getVaults(), page.vaults)
      ? undefined
      : this.onVaultsChanged;
    let keysLoaded = false;
    try {
      // Keys first: this page's merges may need one it brings (a new vault, a rotated key).
      if (onVaultsChanged) {
        await this.store.checkVaultList(page.vaults, { allowVaultLoss });
        await onVaultsChanged(page.vaults);
        keysLoaded = true;
      }
      return await this.store.applySync(this.withoutUncheckableVaults(page), this.resolveConflict, {
        allowVaultLoss,
        isSealed: (row) => this.sealer.isSealedRow(row),
      });
    } catch (error) {
      const stored = await this.store.getVaults();
      if (onVaultsChanged && keysLoaded) {
        await Promise.resolve(onVaultsChanged(stored)).catch(() => undefined);
      }
      if (error instanceof VaultListRejectedError && !sameVaults(before, stored)) {
        this.rerun = true;
        throw new Error("the vault list changed on this device during the pull");
      }
      throw error;
    }
  }

  /**
   * The page without the vaults that hold a row under a key this device
   * doesn't have yet (e.g. a rotation or a new vault, whose key arrives with
   * the sharing tasks): `applySync` would drop it as unsealed, and the cursor
   * move past it. Their rows and cursors wait for a later pull.
   */
  private withoutUncheckableVaults(page: SyncPage): SyncPage {
    const held = new Set(
      page.records.filter((row) => !this.sealer.hasRecordKey(row)).map((row) => row.vaultId),
    );
    if (held.size === 0) return page;
    this.pullHeldBack = true;
    logWarning(`Holding back ${held.size} vault(s): a row is under a key not loaded yet`);
    return {
      ...page,
      records: page.records.filter((row) => !held.has(row.vaultId)),
      cursors: Object.fromEntries(Object.entries(page.cursors).filter(([id]) => !held.has(id))),
    };
  }

  /** Hand the last pull's sharing work to `onSharingTasks`; run again when it changed something. */
  private async runSharingTasks(): Promise<void> {
    const tasks = this.sharingTasks;
    if (
      !this.onSharingTasks ||
      (tasks.keyUpdates.length === 0 && tasks.rotationsDue.length === 0)
    ) {
      this.sharingRotationsPending = [];
      return;
    }
    try {
      const { changed, rotationsPending } = await this.onSharingTasks(tasks);
      if (changed) this.rerun = true;
      this.sharingRotationsPending = rotationsPending;
    } catch (error) {
      // Not attempted (connection lost): every due rotation is still open.
      this.sharingRotationsPending = tasks.rotationsDue;
      logWarning("Sharing tasks failed", error);
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

    try {
      if (this.prepareOutbox) this.reencryptPending = (await this.prepareOutbox()) ?? [];
    } catch (error) {
      // The re-encryption is retried before the next push; until then it stays pending.
      logWarning("Cannot prepare the outbox", error);
    }
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
  private async pushBatch(
    pending: PendingChange[],
    failed: Set<string>,
    sealed = new Map<string, PushChange>(),
  ): Promise<void> {
    const { batch, changes } = await this.seal(pending, failed, sealed);
    if (batch.length === 0) return;
    let results: PushResult[];
    try {
      results = await this.push!(changes);
    } catch (error) {
      if (this.stopsRound(error)) throw error;
      const chains = [...groupChains(batch).values()];
      if (chains.length > 1) {
        const half = Math.ceil(chains.length / 2);
        await this.pushBatch(chains.slice(0, half).flat(), failed, sealed);
        await this.pushBatch(chains.slice(half).flat(), failed, sealed);
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
        // A copy that isn't the change (forged, another record's, other
        // content) is a failed push: counted, so it is parked in the end.
        const accepted =
          this.answers(change, sealed.get(change.changeId)!, result.record) &&
          (await this.store.ackPendingChange(change.changeId, result.record, {
            isSealed: (row) => this.sealer.isSealedRow(row),
          }));
        if (!accepted) {
          failed.add(change.record.recordId);
          await this.fail(change, "the server's copy isn't this change");
        }
        continue;
      }
      if (
        result?.status === "rejected" &&
        result.reason === "not_found" &&
        change.record.tombstoneKind === "purged"
      ) {
        // A purge of a record the server never got (its create never arrived): done.
        await this.store.ackPendingChange(change.changeId, null);
        continue;
      }
      failed.add(change.record.recordId);
      if (result?.status === "rejected" && result.reason === "key_version") {
        // Sealed under a key the vault rotated away from: the next push seals it
        // under the one the pull brings. Counted, in case it never does.
        await this.fail(change, failureMessage(result));
      } else if (result?.status === "rejected") {
        // Not found, forbidden (e.g. access revoked) or over quota: retrying won't help on its own.
        if (result.reason === "quota") this.setStatus({ storageFull: true });
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

  /**
   * Whether the server's copy of an applied change is that change: the same
   * record and vault, at its version and with the ciphertext sent, or (a
   * retry, answered with what an earlier try stored, sealed then) at or below
   * its version, holding the same content. Whether it is sealed as it claims
   * is checked with the ack (`withoutForgedRows`).
   */
  private answers(change: PendingChange, sent: PushChange, copy: EncryptedRecordSchema): boolean {
    const { record } = change;
    if (copy.recordId !== record.recordId || copy.vaultId !== record.vaultId) return false;
    if (copy.version > record.version) return false;
    if (
      copy.version === record.version &&
      copy.encryptedData === sent.encryptedData &&
      copy.encryptionNonce === sent.encryptionNonce
    ) {
      return true;
    }
    // A purge that covered this change (it dropped what an earlier try stored) holds nothing.
    if (copy.tombstoneKind === "purged") return this.sealer.isSealedRow(copy);
    return this.sealer.sameRecordContent(copy, record);
  }

  /**
   * The batch's changes as sealed push changes (each sealed once per push,
   * `sealed`), with their records' later changes held back when one can't be:
   * live content that doesn't open here is parked; a missing vault key counts
   * as a failed push (as a `key_version` rejection would), so a key that
   * never loads parks it in the end.
   */
  private async seal(
    pending: PendingChange[],
    failed: Set<string>,
    sealed: Map<string, PushChange>,
  ): Promise<{ batch: PendingChange[]; changes: PushChange[] }> {
    const batch: PendingChange[] = [];
    const changes: PushChange[] = [];
    for (const change of pending) {
      if (failed.has(change.record.recordId)) continue;
      let pushed = sealed.get(change.changeId);
      try {
        const seal = pushed ? null : this.sealer.sealRecord(change.record);
        if (!pushed && !seal) {
          failed.add(change.record.recordId);
          await this.store.parkPendingChange(change.changeId, "its content doesn't open here");
          continue;
        }
        pushed ??= toPushChange(change, seal!);
      } catch (error) {
        failed.add(change.record.recordId);
        await this.fail(change, `Cannot seal the change: ${errorMessage(error)}`);
        continue;
      }
      sealed.set(change.changeId, pushed);
      changes.push(pushed);
      batch.push(change);
    }
    return { batch, changes };
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
      logWarning("Cannot count the pending changes", error);
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
      this.sync().catch((error: unknown) => logError("Sync failed", error));
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

/** A pending version as a push change, with its sealed ciphertext: it builds on the version below it. */
export function toPushChange({ changeId, record }: PendingChange, seal: RecordContent): PushChange {
  const common = {
    clientChangeId: changeId,
    recordId: record.recordId,
    vaultId: record.vaultId,
    baseVersion: record.version - 1,
    clientUpdatedAt: record.clientUpdatedAt,
  };
  if (record.deleted_at) {
    const { tombstoneKind } = record;
    return { ...common, op: "delete", ...(tombstoneKind && { tombstoneKind }), ...seal };
  }
  return { ...common, op: "put", ...seal };
}

/**
 * Split pending changes into push batches of at most `maxChanges` changes and
 * `maxBytes` (`pushChangeBytes`), keeping each record's changes together and
 * in order. Only a chain too big for one batch is split.
 */
export function pushBatches(
  changes: readonly PendingChange[],
  maxChanges = MAX_PUSH_CHANGES,
  maxBytes = MAX_PUSH_BYTES,
): PendingChange[][] {
  const fits = (count: number, bytes: number) => count <= maxChanges && bytes <= maxBytes;
  const batches: PendingChange[][] = [];
  let batch: PendingChange[] = [];
  let batchBytes = 0;
  for (const chain of groupChains(changes).values()) {
    const chainBytes = chain.map((change) => sealedBytes(change.record));
    let piece: PendingChange[] = [];
    let pieceBytes = 0;
    const addPiece = () => {
      if (!fits(batch.length + piece.length, batchBytes + pieceBytes) && batch.length > 0) {
        batches.push(batch);
        batch = [];
        batchBytes = 0;
      }
      batch.push(...piece);
      batchBytes += pieceBytes;
    };
    for (const [i, change] of chain.entries()) {
      if (piece.length > 0 && !fits(piece.length + 1, pieceBytes + chainBytes[i]!)) {
        addPiece();
        piece = [];
        pieceBytes = 0;
      }
      piece.push(change);
      pieceBytes += chainBytes[i]!;
    }
    addPiece();
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/**
 * A pending version's size once sealed: the draft's (sealing keeps a content's
 * length; a tombstone carries its head's content, or none), except a purge,
 * whose empty draft is sealed into a tag.
 */
function sealedBytes(record: EncryptedRecordSchema): number {
  return record.tombstoneKind === "purged"
    ? pushChangeBytes({ encryptedData: "" }) + MAX_PURGE_SEAL_LENGTH
    : pushChangeBytes(record);
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

/** `next`, or `current` when they list the same: a status listener sees no change. */
function sameList(next: readonly string[], current: readonly string[]): readonly string[] {
  return next.length === current.length && next.every((id, i) => id === current[i])
    ? current
    : next;
}
