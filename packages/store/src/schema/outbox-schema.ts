import type { EncryptedRecordSchema } from "@repo/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { LocalDb } from "../local-db";
import { outbox, records } from "./tables";

/** A stored record version and whether the server has it yet. */
export type LocalRecordVersion = EncryptedRecordSchema & { syncState: "synced" | "pending" };

/** A record version written on this device, waiting for the server. */
export type PendingChange = {
  changeId: string;
  attempts: number;
  lastError: string | null;
  record: EncryptedRecordSchema;
};

/** The ciphertext of a new record version, encrypted under its vault's key. */
export type RecordCiphertext = Pick<
  EncryptedRecordSchema,
  "recordId" | "vaultId" | "encryptedData" | "encryptionNonce" | "cryptoVersion" | "clientUpdatedAt"
>;

/**
 * One local write (ADR 0001 D1). `update` appends to the record whatever its
 * head is, a tombstone included (an edit restores a deleted record, D5);
 * `delete` appends a tombstone carrying the head's ciphertext, so the history
 * still opens.
 */
export type LocalRecordChange =
  | ({ kind: "create" } & RecordCiphertext)
  | ({ kind: "update" } & RecordCiphertext)
  | { kind: "delete"; recordId: string; clientUpdatedAt: string };

export class RecordWriteError extends Error {
  readonly recordId: string;

  constructor(recordId: string, reason: string) {
    super(`Cannot write record ${recordId}: ${reason}`);
    this.name = "RecordWriteError";
    this.recordId = recordId;
  }
}

export async function clearOutboxTable(db: LocalDb) {
  await db.delete(outbox);
}

/** The newest version of a record (pending or not, deleted or not). */
async function getHead(recordId: string, db: LocalDb) {
  return await db
    .select()
    .from(records)
    .where(eq(records.recordId, recordId))
    .orderBy(desc(records.version))
    .limit(1)
    .get();
}

/**
 * Write one change as the record's next version, marked `pending`, and enqueue
 * it. The version is provisional (head + 1); the server assigns the canonical
 * one (D5). Run inside a transaction, so the row and its outbox entry land
 * together or not at all.
 */
export async function writeLocalChange(
  change: LocalRecordChange,
  now: string,
  db: LocalDb,
): Promise<EncryptedRecordSchema> {
  const head = await getHead(change.recordId, db);
  let row: Omit<EncryptedRecordSchema, "created_at" | "updated_at">;

  if (change.kind === "create") {
    if (head) throw new RecordWriteError(change.recordId, "it already exists");
    const { kind: _kind, ...ciphertext } = change;
    row = { ...ciphertext, version: 1, deleted_at: null };
  } else if (!head) {
    throw new RecordWriteError(change.recordId, "it doesn't exist");
  } else if (change.kind === "update") {
    // The ciphertext is bound to its vault: it would never open in another one.
    if (head.vaultId !== change.vaultId) {
      throw new RecordWriteError(change.recordId, "it lives in another vault");
    }
    const { kind: _kind, ...ciphertext } = change;
    row = { ...ciphertext, version: head.version + 1, deleted_at: null };
  } else {
    if (head.deleted_at !== null) throw new RecordWriteError(change.recordId, "already deleted");
    row = {
      recordId: head.recordId,
      vaultId: head.vaultId,
      encryptedData: head.encryptedData,
      encryptionNonce: head.encryptionNonce,
      cryptoVersion: head.cryptoVersion,
      clientUpdatedAt: change.clientUpdatedAt,
      version: head.version + 1,
      deleted_at: now,
    };
  }

  const written = { ...row, created_at: now, updated_at: now };
  await db.insert(records).values({ ...written, syncState: "pending" });
  await db.insert(outbox).values({
    changeId: crypto.randomUUID(),
    recordId: row.recordId,
    version: row.version,
    createdAt: now,
  });
  return written;
}

/** Pending changes in write order, oldest first. */
export async function getPendingChanges(db: LocalDb, limit?: number): Promise<PendingChange[]> {
  const query = db
    .select({
      changeId: outbox.changeId,
      attempts: outbox.attempts,
      lastError: outbox.lastError,
      record: records,
    })
    .from(outbox)
    .innerJoin(
      records,
      and(eq(records.recordId, outbox.recordId), eq(records.version, outbox.version)),
    )
    .orderBy(asc(outbox.seq));
  return limit === undefined ? await query : await query.limit(limit);
}

export async function countPendingChanges(db: LocalDb): Promise<number> {
  const row = await db.select({ n: sql<number>`count(*)` }).from(outbox).get();
  return row?.n ?? 0;
}

/**
 * The server stored a change: drop its outbox entry and mark the row synced,
 * replacing it with the server's copy (canonical timestamps) when there is one.
 * Run inside a transaction.
 */
export async function ackPendingChange(
  changeId: string,
  serverRow: EncryptedRecordSchema | null,
  db: LocalDb,
): Promise<void> {
  const entry = await db.select().from(outbox).where(eq(outbox.changeId, changeId)).get();
  if (!entry) return;
  await db.delete(outbox).where(eq(outbox.changeId, changeId));

  const at = and(eq(records.recordId, entry.recordId), eq(records.version, entry.version));
  if (!serverRow) {
    await db.update(records).set({ syncState: "synced" }).where(at);
    return;
  }
  // Same (recordId, version) unless the server numbered it differently.
  await db.delete(records).where(at);
  await db.insert(records).values({
    recordId: serverRow.recordId,
    vaultId: serverRow.vaultId,
    encryptedData: serverRow.encryptedData,
    encryptionNonce: serverRow.encryptionNonce,
    cryptoVersion: serverRow.cryptoVersion,
    version: serverRow.version,
    clientUpdatedAt: serverRow.clientUpdatedAt,
    created_at: serverRow.created_at,
    updated_at: serverRow.updated_at,
    deleted_at: serverRow.deleted_at,
    syncState: "synced",
  });
}

/** A push of this change failed: count it and keep the reason for the UI. */
export async function failPendingChange(changeId: string, error: string, db: LocalDb) {
  await db
    .update(outbox)
    .set({ attempts: sql`${outbox.attempts} + 1`, lastError: error })
    .where(eq(outbox.changeId, changeId));
}

/** Drop the outbox entries of records in these vaults (access was revoked). */
export async function deleteVaultChanges(vaultIds: readonly string[], db: LocalDb) {
  if (vaultIds.length === 0) return;
  const inVaults = db
    .select({ recordId: records.recordId })
    .from(records)
    .where(inArray(records.vaultId, [...vaultIds]));
  await db.delete(outbox).where(inArray(outbox.recordId, inVaults));
}

/**
 * A record edited here (pending versions) and on the server since this device
 * last synced it (ADR 0001 D5). Rows are encrypted, oldest first.
 */
export type RecordConflict = {
  /** The synced version the local edits started from. */
  base: EncryptedRecordSchema;
  /** The pending chain. */
  local: EncryptedRecordSchema[];
  /** The server's versions above `base`, as far as this pull brought them. */
  remote: EncryptedRecordSchema[];
  /** The server's time of the pull: no local edit can be later. */
  receivedAt: string;
};

/**
 * Merge both sides of a conflict. Resolves the merged version to append on top
 * of the local chain, or null when the local head already is the merge.
 */
export type ConflictResolver = (
  conflict: RecordConflict,
) => RecordCiphertext | null | Promise<RecordCiphertext | null>;

type RebaseOptions = { resolve?: ConflictResolver; receivedAt?: string };

/**
 * Make room for server versions that collide with local pending ones: a pulled
 * row takes its (recordId, version) slot, and the record's pending chain moves
 * up above the newest pulled version, keeping its order (and its outbox
 * entries in step). Nothing is lost; both edits stay in the history.
 *
 * With `resolve`, the two sides are then merged field by field (D5) and the
 * merge is appended as one more pending version, so the server ends up with
 * the server head, the local edits (pushed first, kept as history) and the
 * merge on top. A conflict that can't be merged (no base version here, or the
 * resolver throws, e.g. a vault key that doesn't open it) keeps the plain move.
 * Run inside a transaction, before the pulled rows are written.
 */
export async function rebasePendingVersions(
  incoming: readonly EncryptedRecordSchema[],
  db: LocalDb,
  { resolve, receivedAt = new Date().toISOString() }: RebaseOptions = {},
): Promise<void> {
  const pending: EncryptedRecordSchema[] = await db
    .select()
    .from(records)
    .where(eq(records.syncState, "pending"))
    .orderBy(asc(records.recordId), asc(records.version));
  if (pending.length === 0) return;

  const pulled = groupByRecord(incoming);
  const chains = groupByRecord(pending);

  for (const [recordId, chain] of chains) {
    const first = chain[0]!.version;
    const remote = (pulled.get(recordId) ?? [])
      .filter((row) => row.version >= first)
      .sort((a, b) => a.version - b.version);
    // Pending versions always sit above the synced ones, so only pulled rows can collide.
    const serverHead = remote.at(-1)?.version;
    if (serverHead === undefined) continue;

    const base =
      (await db
        .select()
        .from(records)
        .where(and(eq(records.recordId, recordId), eq(records.version, first - 1)))
        .get()) ?? pulled.get(recordId)?.find((row) => row.version === first - 1);

    const shift = serverHead + 1 - first;
    // Highest first: each row moves into a slot already vacated.
    for (const { version } of [...chain].reverse()) {
      await db
        .update(records)
        .set({ version: version + shift })
        .where(and(eq(records.recordId, recordId), eq(records.version, version)));
      await db
        .update(outbox)
        .set({ version: version + shift })
        .where(and(eq(outbox.recordId, recordId), eq(outbox.version, version)));
    }

    if (!resolve || !base) continue;
    let merged: RecordCiphertext | null;
    try {
      const local = chain.map((row) => ({ ...row, version: row.version + shift }));
      merged = await resolve({ base, local, remote, receivedAt });
    } catch (error) {
      console.warn(`Cannot merge record ${recordId}; the local edit stays on top`, error);
      continue;
    }
    if (merged) await writeLocalChange({ kind: "update", ...merged }, new Date().toISOString(), db);
  }
}

function groupByRecord(rows: readonly EncryptedRecordSchema[]) {
  const groups = new Map<string, EncryptedRecordSchema[]>();
  for (const row of rows) {
    const group = groups.get(row.recordId);
    if (group) group.push(row);
    else groups.set(row.recordId, [row]);
  }
  return groups;
}

/** Every version of a record, newest first, pending ones included. */
export async function getRecordHistory(
  recordId: string,
  db: LocalDb,
): Promise<LocalRecordVersion[]> {
  return await db
    .select()
    .from(records)
    .where(eq(records.recordId, recordId))
    .orderBy(desc(records.version));
}
