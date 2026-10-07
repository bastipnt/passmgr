import { db, type RecordType, recordsTable } from "@repo/db";
import { type PushChange, type PushResult, VAULT_WRITE_ROLES } from "@repo/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, inArray, sql } from "drizzle-orm";
import { isLockTimeout, isUniqueViolation } from "../util/general";
import { type DbExecutor, lockVaults, requireVaultRole, takeVaultSeqs } from "../vault/access";
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

/** What a new version needs from the one below it (a tombstone keeps its ciphertext). */
type HeadContent = Pick<
  RecordType,
  "version" | "encryptedData" | "encryptionNonce" | "cryptoVersion"
> | null;

type NewVersion = Omit<typeof recordsTable.$inferInsert, "seq"> & {
  version: number;
  cryptoVersion: number;
};

type Indexed = { index: number; change: PushChange };

export type PushOutcome = { results: PushResult[]; writtenVaultIds: string[] };

/**
 * Apply a batch of changes (ADR 0001 D5/D8) in one transaction, answering each
 * change on its own. Every vault written to is locked first, so the
 * compare-and-swap on `baseVersion` is decided under the lock: two racing
 * pushes queue up and the second gets a clean `stale`.
 *
 * A record's changes are a chain: they apply all together or not at all, so
 * no other device ever pulls half of it (e.g. a losing edit without the merge
 * on top). A change whose `clientChangeId` the record already has answers with
 * the stored version, so a retry after a lost response appends nothing.
 *
 * Every applied change appends exactly one version (a delete of a deleted
 * record too), so the server numbers a chain the way the client did.
 *
 * The new versions are planned in memory and written with one seq bump per
 * vault and one insert, keeping the time the vaults stay locked short.
 *
 * Throws SERVICE_UNAVAILABLE when a vault stays locked past `LOCK_TIMEOUT`, or
 * a new record id raced into the same id elsewhere: the client retries later.
 */
export async function pushChanges(userId: string, changes: PushChange[]): Promise<PushOutcome> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`));

      const access = await vaultAccess(userId, changes, tx);
      await lockVaults(
        tx,
        [...access].filter(([, denied]) => denied === null).map(([vaultId]) => vaultId),
      );

      const chains = groupByRecord(changes);
      const recordIds = [...chains.keys()];
      const heads = await latestVersions(recordIds, tx);
      const stored = await storedChanges(
        recordIds,
        changes.map((c) => c.clientChangeId),
        tx,
      );

      const results: PushResult[] = Array.from({ length: changes.length });
      const planned: { index: number; version: NewVersion }[] = [];
      for (const [recordId, chain] of chains) {
        const dbHead = heads.get(recordId) ?? null;
        const outcomes = decideChain(chain, dbHead, access, stored);
        let head: HeadContent = dbHead;
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
            planned.push({ index, version });
            head = version;
          }
        }
      }

      const written = await insertVersions(
        planned.map((p) => p.version),
        tx,
      );
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
 * first failure. Changes the server already stored still answer as applied.
 */
function decideChain(
  chain: Indexed[],
  dbHead: RecordType | null,
  access: Map<string, Rejection | null>,
  stored: Map<string, RecordType>,
): Outcome[] {
  let head: SimulatedHead = dbHead && { version: dbHead.version, vaultId: dbHead.vaultId };
  let failure: Failure | null = null;
  const outcomes: Outcome[] = [];

  for (const { change } of chain) {
    const outcome = decideChange(change, head, dbHead?.version ?? 0, access, stored);
    if (outcome.kind === "failed") {
      const { kind: _kind, ...rest } = outcome;
      failure ??= rest;
    } else if (outcome.kind === "append") {
      head = { version: (head?.version ?? 0) + 1, vaultId: change.vaultId };
    }
    outcomes.push(outcome);
  }

  if (!failure) return outcomes;
  const first = failure;
  return outcomes.map((o) => (o.kind === "stored" ? o : { kind: "failed", ...first }));
}

/** One change of a chain: access, then a retry, then compare-and-swap. */
function decideChange(
  change: PushChange,
  head: SimulatedHead,
  dbHeadVersion: number,
  access: Map<string, Rejection | null>,
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
  return decide(change, head, dbHeadVersion);
}

/**
 * One change against the record's (simulated) head. A put on a tombstone
 * restores the record (an edit beats a delete, D5); a delete of a tombstone
 * appends another one, so the numbering stays the client's.
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

/** A change as the version on top of `head`, without its seq yet. */
function nextVersion(change: PushChange, head: HeadContent, userId: string): NewVersion {
  const common = {
    recordId: change.recordId,
    vaultId: change.vaultId,
    userId,
    version: (head?.version ?? 0) + 1,
    clientUpdatedAt: new Date(change.clientUpdatedAt),
    clientChangeId: change.clientChangeId,
  };
  if (change.op === "put") {
    const { encryptedData, encryptionNonce, cryptoVersion } = change;
    return { ...common, encryptedData, encryptionNonce, cryptoVersion };
  }
  // A tombstone keeps the head's ciphertext, so the history still opens.
  if (!head) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const { encryptedData, encryptionNonce, cryptoVersion } = head;
  return { ...common, encryptedData, encryptionNonce, cryptoVersion, deleted_at: new Date() };
}

/**
 * Write new versions with one seq bump per vault (in id order, as locked) and
 * one insert. Each vault's seqs follow the versions' order. Resolves the rows
 * in the order given.
 */
async function insertVersions(versions: NewVersion[], tx: DbExecutor): Promise<RecordType[]> {
  if (versions.length === 0) return [];

  const counts = new Map<string, number>();
  for (const { vaultId } of versions) counts.set(vaultId, (counts.get(vaultId) ?? 0) + 1);
  const nextSeq = new Map<string, number>();
  for (const vaultId of [...counts.keys()].sort()) {
    nextSeq.set(vaultId, await takeVaultSeqs(tx, vaultId, counts.get(vaultId)!));
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

/** The newest version of each record, deleted or not. */
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
