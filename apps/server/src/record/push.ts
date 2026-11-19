import { db, type RecordType, recordsTable, vaultsTable } from "@repo/db";
import { type PushChange, type PushResult, pushChangeBytes, VAULT_WRITE_ROLES } from "@repo/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { isLockTimeout, isUniqueViolation } from "../util/general";
import {
  type DbExecutor,
  lockVaults,
  requireVaultRole,
  takeVaultSeqs,
  vaultKeyVersions,
} from "../vault/access";
import { DELETE_HEADROOM_BYTES, type StorageBudget, storageBudgets } from "./quota";
import { serializeRecord } from "./serialize";

/**
 * How long a push waits for a vault another transaction holds: a stuck writer
 * must not block every write to the vault indefinitely.
 */
const LOCK_TIMEOUT = "5s";

type Rejection = Extract<PushResult, { status: "rejected" }>["reason"];
type Failure = { status: "stale"; headVersion: number } | { status: "rejected"; reason: Rejection };

/** What pass 1 decided for a change; pass 2 carries it out. */
type Outcome =
  | { kind: "stored"; row: RecordType } // a retry: the server has it already
  | { kind: "append" } // the record's next version
  | ({ kind: "failed" } & Failure);

/** The record as pass 1 has it after the changes before. */
type SimulatedHead = { version: number; vaultId: string } | null;

type NewVersion = Omit<typeof recordsTable.$inferInsert, "seq"> & {
  version: number;
  cryptoVersion: number;
  keyVersion: number;
};

/** What pass 1 checks a change against: write access and each vault's current key version. */
type VaultState = { access: Map<string, Rejection | null>; keyVersions: Map<string, number> };

type Indexed = { index: number; change: PushChange };

type Appended = { index: number; version: NewVersion }[];

export type PushOutcome = { results: PushResult[]; writtenVaultIds: string[] };

/**
 * Every vault written to is locked first, so the compare-and-swap on `baseVersion` is decided under
 * the lock. Chains, sealing, purge, quota: see docs/architecture/vaults-and-sync.md (ADR 0001 D5/D8).
 */
export async function pushChanges(userId: string, changes: PushChange[]): Promise<PushOutcome> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`));

      const access = await vaultAccess(userId, changes, tx);
      const writable = [...access].filter(([, denied]) => denied === null).map(([id]) => id);
      await lockVaults(tx, writable);
      // Under the lock: a rotation of these vaults waits until this push commits.
      const keyVersions = await vaultKeyVersions(tx, writable);
      // Deleted while this push waited for the lock.
      for (const vaultId of writable)
        if (!keyVersions.has(vaultId)) access.set(vaultId, "not_found");
      const vaults: VaultState = { access, keyVersions };
      const budgets = await storageBudgets(tx, writable);

      const chains = groupByRecord(changes);
      const recordIds = [...chains.keys()];
      const heads = await latestVersions(recordIds, tx);
      const stored = await storedChanges(
        recordIds,
        changes.map((c) => c.clientChangeId),
        tx,
      );

      const results: PushResult[] = Array.from({ length: changes.length });
      const accepted: { chain: Indexed[]; appended: Appended }[] = [];
      let overQuota = false;
      const rejectForQuota = (appended: Appended) => {
        for (const { index } of appended) {
          const { clientChangeId } = changes[index]!;
          results[index] = { clientChangeId, status: "rejected", reason: "quota" };
        }
      };
      for (const [recordId, chain] of chains) {
        const dbHead = heads.get(recordId) ?? null;
        const outcomes = decideChain(chain, dbHead, vaults, stored);
        let head: SimulatedHead = dbHead;
        const appended: Appended = [];
        for (const [i, { index, change }] of chain.entries()) {
          const outcome = outcomes[i]!;
          const { clientChangeId } = change;
          if (outcome.kind === "failed") {
            const { kind: _kind, ...failure } = outcome;
            results[index] = { clientChangeId, ...failure };
          } else if (outcome.kind === "stored") {
            results[index] = {
              clientChangeId,
              status: "applied",
              record: serializeRecord(outcome.row),
            };
          } else {
            const version = nextVersion(change, head, userId);
            appended.push({ index, version });
            head = version;
          }
        }
        // Only a rotation's re-encryption (puts) is exempt: a delete brings
        // ciphertext of its own, which must not get past the quota this way.
        const rewritesOldKey =
          !!dbHead &&
          dbHead.keyVersion < (vaults.keyVersions.get(dbHead.vaultId) ?? 0) &&
          chain.every(({ change }) => change.op === "put");
        if (rewritesOldKey || withinQuota(chain, appended, budgets)) {
          accepted.push({ chain, appended });
        } else {
          overQuota = true;
          rejectForQuota(appended);
        }
      }

      const planned: Appended = [];
      for (const { chain, appended } of accepted) {
        if (overQuota && chain.some(({ change }) => isMoveSource(change))) rejectForQuota(appended);
        else planned.push(...appended);
      }

      const written = await insertVersions(
        planned.map((p) => p.version),
        tx,
      );
      await dropPurgedHistory(written, tx);
      for (const [i, { index }] of planned.entries()) {
        const row = written[i]!;
        results[index] = {
          clientChangeId: row.clientChangeId,
          status: "applied",
          record: serializeRecord(row),
        };
      }
      return { results, writtenVaultIds: [...new Set(written.map((row) => row.vaultId))] };
    });
  } catch (error) {
    if (isLockTimeout(error) || isUniqueViolation(error)) {
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "busy, push again later" });
    }
    throw error;
  }
}

/**
 * Pass 1 for one record's chain, without writing: each change is checked
 * against the head the changes before it would leave. When one can't apply,
 * none of the chain's new versions are written, and those changes all get the
 * first failure. Changes the server already stored still answer as applied,
 * and so does one below them that isn't stored: the stored one covered it.
 */
function decideChain(
  chain: Indexed[],
  dbHead: RecordType | null,
  vaults: VaultState,
  stored: Map<string, RecordType>,
): Outcome[] {
  let head: SimulatedHead = dbHead;
  const outcomes: Outcome[] = [];

  for (const { change } of chain) {
    const outcome = decideChange(change, head, dbHead?.version ?? 0, vaults, stored);
    if (outcome.kind === "append") {
      head = { version: (head?.version ?? 0) + 1, vaultId: change.vaultId };
    }
    outcomes.push(outcome);
  }

  let covering: RecordType | null = null;
  for (let i = outcomes.length - 1; i >= 0; i--) {
    const outcome = outcomes[i]!;
    if (outcome.kind === "stored") covering = outcome.row;
    else if (
      covering &&
      outcome.kind !== "append" &&
      covering.vaultId === chain[i]!.change.vaultId
    ) {
      outcomes[i] = { kind: "stored", row: covering };
    }
  }

  const failed = outcomes.find(
    (o): o is Extract<Outcome, { kind: "failed" }> => o.kind === "failed",
  );
  if (!failed) return outcomes;
  const { kind: _kind, ...first } = failed;
  return outcomes.map((o) => (o.kind === "stored" ? o : { kind: "failed", ...first }));
}

/** One change of a chain: access, then a retry, then the key, then compare-and-swap. */
function decideChange(
  change: PushChange,
  head: SimulatedHead,
  dbHeadVersion: number,
  { access, keyVersions }: VaultState,
  stored: Map<string, RecordType>,
): Outcome {
  // Every vault of the batch was checked; a missing entry would be a bug, so it denies.
  const denied = access.has(change.vaultId) ? access.get(change.vaultId) : "not_found";
  if (denied) return { kind: "failed", status: "rejected", reason: denied };

  const row = stored.get(`${change.recordId}/${change.clientChangeId}`);
  if (row) {
    // Never hand out a version from a vault other than the one checked above.
    return row.vaultId === change.vaultId
      ? { kind: "stored", row }
      : { kind: "failed", status: "rejected", reason: "not_found" };
  }
  if (change.keyVersion !== keyVersions.get(change.vaultId)) {
    return { kind: "failed", status: "rejected", reason: "key_version" };
  }
  return decide(change, head, dbHeadVersion);
}

/**
 * One change against the record's (simulated) head. A put on a tombstone
 * restores the record (an edit beats a delete, D5); a delete of a tombstone
 * appends another one, of the kind it is sealed for.
 */
function decide(change: PushChange, head: SimulatedHead, dbHeadVersion: number): Outcome {
  if (!head) {
    // A version of a record the server doesn't have can never apply.
    if (change.op === "delete" || change.baseVersion !== 0) {
      return { kind: "failed", status: "rejected", reason: "not_found" };
    }
    return { kind: "append" };
  }
  // A record never changes vaults; an id from another vault isn't probed.
  if (head.vaultId !== change.vaultId) {
    return { kind: "failed", status: "rejected", reason: "not_found" };
  }
  if (change.baseVersion !== head.version) {
    return { kind: "failed", status: "stale", headVersion: dbHeadVersion };
  }
  return { kind: "append" };
}

/**
 * Whether a chain's new versions fit its vault owner's budget, which they
 * then take from. A chain of deletes gets `DELETE_HEADROOM_BYTES` past it; one
 * ending in a purge is never over it (the purge drops what the chain wrote).
 */
function withinQuota(
  chain: Indexed[],
  appended: { version: NewVersion }[],
  budgets: Map<string, StorageBudget>,
): boolean {
  const budget = appended[0] && budgets.get(appended[0].version.vaultId);
  if (!budget) return true;
  const bytes = appended.reduce((sum, { version }) => sum + pushChangeBytes(version), 0);
  const endsInPurge = appended.at(-1)?.version.tombstoneKind === "purged";
  const allowed = chain.some(({ change }) => change.op === "put")
    ? budget.remaining
    : budget.remaining + DELETE_HEADROOM_BYTES;
  if (bytes > allowed && !endsInPurge) return false;
  budget.remaining -= bytes;
  return true;
}

function isMoveSource(change: PushChange): boolean {
  return change.op === "delete" && change.tombstoneKind === "moved";
}

/** A change as the version on top of `head`, without its seq yet. */
function nextVersion(change: PushChange, head: SimulatedHead, userId: string): NewVersion {
  const common = {
    recordId: change.recordId,
    vaultId: change.vaultId,
    userId,
    version: (head?.version ?? 0) + 1,
    clientUpdatedAt: new Date(change.clientUpdatedAt),
    clientChangeId: change.clientChangeId,
  };
  const { encryptedData, encryptionNonce, cryptoVersion, keyVersion } = change;
  const sealed = { ...common, encryptedData, encryptionNonce, cryptoVersion, keyVersion };
  if (change.op === "put") return sealed;
  return { ...sealed, deleted_at: new Date(), tombstoneKind: change.tombstoneKind ?? null };
}

/** Drop every version below a purged tombstone just written: its history is gone for good. */
async function dropPurgedHistory(written: RecordType[], tx: DbExecutor) {
  for (const row of written) {
    if (row.tombstoneKind !== "purged") continue;
    const dropped = await tx
      .delete(recordsTable)
      .where(and(eq(recordsTable.recordId, row.recordId), lt(recordsTable.version, row.version)))
      .returning({ encryptedData: recordsTable.encryptedData });
    const freed = dropped.reduce((sum, version) => sum + pushChangeBytes(version), 0);
    await tx
      .update(vaultsTable)
      .set({ usedBytes: sql`${vaultsTable.usedBytes} - ${freed}` })
      .where(eq(vaultsTable.vaultId, row.vaultId));
  }
}

/**
 * Write new versions with one insert and one seq bump per vault (in id order,
 * as locked) that also adds their bytes to `usedBytes`. Each vault's seqs
 * follow the versions' order. Resolves the rows in the order given.
 */
async function insertVersions(versions: NewVersion[], tx: DbExecutor): Promise<RecordType[]> {
  if (versions.length === 0) return [];

  const added = new Map<string, { count: number; bytes: number }>();
  for (const version of versions) {
    const vault = added.get(version.vaultId) ?? { count: 0, bytes: 0 };
    vault.count++;
    vault.bytes += pushChangeBytes(version);
    added.set(version.vaultId, vault);
  }
  const nextSeq = new Map<string, number>();
  for (const vaultId of [...added.keys()].sort()) {
    const { count, bytes } = added.get(vaultId)!;
    nextSeq.set(vaultId, await takeVaultSeqs(tx, vaultId, count, bytes));
  }

  const rows = versions.map((version) => {
    const seq = nextSeq.get(version.vaultId)!;
    nextSeq.set(version.vaultId, seq + 1);
    return { ...version, seq };
  });
  const written = await tx.insert(recordsTable).values(rows).returning();
  const byKey = new Map(written.map((row) => [`${row.recordId}/${row.version}`, row]));
  return rows.map(({ recordId, version }) => {
    const row = byKey.get(`${recordId}/${version}`);
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return row;
  });
}

/**
 * Whether the user may write to each vault of the batch: null when they may,
 * else why not (`not_found` for a vault that doesn't exist or isn't theirs).
 */
async function vaultAccess(
  userId: string,
  changes: PushChange[],
  tx: DbExecutor,
): Promise<Map<string, Rejection | null>> {
  const access = new Map<string, Rejection | null>();
  for (const vaultId of new Set(changes.map((c) => c.vaultId))) {
    try {
      await requireVaultRole(userId, vaultId, VAULT_WRITE_ROLES, tx);
      access.set(vaultId, null);
    } catch (error) {
      if (!(error instanceof TRPCError)) throw error;
      access.set(vaultId, error.code === "FORBIDDEN" ? "forbidden" : "not_found");
    }
  }
  return access;
}

async function latestVersions(recordIds: string[], tx: DbExecutor) {
  const rows = await tx
    .selectDistinctOn([recordsTable.recordId])
    .from(recordsTable)
    .where(inArray(recordsTable.recordId, recordIds))
    .orderBy(recordsTable.recordId, desc(recordsTable.version));
  return new Map(rows.map((row) => [row.recordId, row]));
}

/** Versions written by these changes before, keyed `recordId/clientChangeId`. */
async function storedChanges(recordIds: string[], clientChangeIds: string[], tx: DbExecutor) {
  const rows = await tx
    .select()
    .from(recordsTable)
    .where(
      and(
        inArray(recordsTable.recordId, recordIds),
        inArray(recordsTable.clientChangeId, clientChangeIds),
      ),
    );
  return new Map(rows.map((row) => [`${row.recordId}/${row.clientChangeId}`, row]));
}

/** Changes grouped by record, each group in batch order. */
function groupByRecord(changes: PushChange[]): Map<string, Indexed[]> {
  const chains = new Map<string, Indexed[]>();
  for (const [index, change] of changes.entries()) {
    const chain = chains.get(change.recordId);
    if (chain) chain.push({ index, change });
    else chains.set(change.recordId, [{ index, change }]);
  }
  return chains;
}
