import type { EncryptedRecordSchema } from "@repo/schema";
import { and, desc, eq, inArray, isNotNull, isNull, max, min, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { LocalDb } from "../local-db";
import { secretsStore } from "../secrets-store";
import { chunkByParams, columnCount } from "./chunk-by-params";
import type { LocalRecordVersion } from "./outbox-schema";
import { records } from "./tables";

/**
 * Server-sent rows replace the local copy of the same (recordId, version). A
 * pull moves colliding pending rows out of the way first (`rebasePendingVersions`).
 */
const replaceOnConflict = {
  target: [records.recordId, records.version],
  set: {
    vaultId: sql`excluded.vaultId`,
    encryptedData: sql`excluded.encryptedData`,
    encryptionNonce: sql`excluded.encryptionNonce`,
    cryptoVersion: sql`excluded.cryptoVersion`,
    keyVersion: sql`excluded.keyVersion`,
    clientUpdatedAt: sql`excluded.clientUpdatedAt`,
    created_at: sql`excluded.created_at`,
    updated_at: sql`excluded.updated_at`,
    deleted_at: sql`excluded.deleted_at`,
    tombstoneKind: sql`excluded.tombstoneKind`,
    syncState: sql`excluded.syncState`,
  },
};

export async function clearRecordsTable(db: LocalDb) {
  await db.delete(records);
}

/** Drop every version of every record in these vaults (e.g. access was revoked). */
export async function deleteVaultRecords(vaultIds: readonly string[], db: LocalDb) {
  if (vaultIds.length === 0) return;
  await db.delete(records).where(inArray(records.vaultId, [...vaultIds]));
}

/** Whether a row from the server was sealed by a vault member for what it claims (ADR 0001 D11). */
export type SealCheck = (row: EncryptedRecordSchema) => boolean;

export const isSealedBySecretsStore: SealCheck = (row) => secretsStore.isSealedRow(row);

/**
 * Rows from the server it may not send, left out (and logged): one that
 * replaces a synced version with other ciphertext (a stored version never
 * changes), and one no vault member sealed for its slot, key version and state
 * (`isSealed`): an old ciphertext served as a newer version, content turned
 * into a tombstone, a forged purge (which would drop the record's history
 * here), or a draft passed off as sealed. A row under a key that isn't loaded
 * doesn't open either: a caller that expects the key holds such rows back
 * (`SyncManager`).
 */
export async function withoutForgedRows(
  incoming: readonly EncryptedRecordSchema[],
  db: LocalDb,
  isSealed: SealCheck = isSealedBySecretsStore,
): Promise<EncryptedRecordSchema[]> {
  const synced = new Map<string, { encryptedData: string; encryptionNonce: string }>();
  // Each row adds its recordId and its version to the two IN lists; "synced" binds one more.
  for (const chunk of chunkByParams(incoming, 2, 1)) {
    const slots = await db
      .select({
        recordId: records.recordId,
        version: records.version,
        encryptedData: records.encryptedData,
        encryptionNonce: records.encryptionNonce,
      })
      .from(records)
      .where(
        and(
          inArray(records.recordId, [...new Set(chunk.map((r) => r.recordId))]),
          inArray(records.version, [...new Set(chunk.map((r) => r.version))]),
          eq(records.syncState, "synced"),
        ),
      );
    for (const { recordId, version, ...ciphertext } of slots) {
      synced.set(`${recordId}/${version}`, ciphertext);
    }
  }

  return incoming.filter((row) => {
    const local = synced.get(`${row.recordId}/${row.version}`);
    const reason =
      local &&
      (local.encryptedData !== row.encryptedData || local.encryptionNonce !== row.encryptionNonce)
        ? "it rewrites a stored version"
        : !isSealed(row)
          ? "no vault member sealed it as it is"
          : null;
    if (reason) {
      console.warn(
        `Ignoring record ${row.recordId} version ${row.version} from the server: ${reason}`,
      );
    }
    return reason === null;
  });
}

/** Run inside a transaction: large inputs span several statements. */
export async function upsertRecords(rows: EncryptedRecordSchema[], db: LocalDb): Promise<void> {
  for (const batch of chunkByParams(rows, columnCount(records))) {
    const chunk = batch.map((r) => ({
      recordId: r.recordId,
      vaultId: r.vaultId,
      encryptedData: r.encryptedData,
      encryptionNonce: r.encryptionNonce,
      cryptoVersion: r.cryptoVersion,
      keyVersion: r.keyVersion,
      version: r.version,
      clientUpdatedAt: r.clientUpdatedAt,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at,
      tombstoneKind: r.tombstoneKind ?? null,
    }));
    await db.insert(records).values(chunk).onConflictDoUpdate(replaceOnConflict);
  }
}

/**
 * The latest version of every record that isn't deleted, with its first
 * creation date: of one vault, or of all of them ("All vaults").
 */
export async function getAllRecordsLatest(
  db: LocalDb,
  vaultId?: string,
): Promise<LocalRecordVersion[]> {
  return await getLatestVersions(db, isNull(records.deleted_at), vaultId);
}

/**
 * The records in the trash: deleted (not moved or purged), as their tombstone,
 * which carries the content they had, with its first creation date.
 */
export async function getDeletedRecords(
  db: LocalDb,
  vaultId?: string,
): Promise<LocalRecordVersion[]> {
  return await getLatestVersions(
    db,
    and(isNotNull(records.deleted_at), isNull(records.tombstoneKind)),
    vaultId,
  );
}

async function getLatestVersions(
  db: LocalDb,
  filter: SQL | undefined,
  vaultId: string | undefined,
): Promise<LocalRecordVersion[]> {
  const latest = db
    .select({
      recordId: records.recordId,
      maxVersion: max(records.version).as("maxVersion"),
      firstCreatedAt: min(records.created_at).as("firstCreatedAt"),
    })
    .from(records)
    .groupBy(records.recordId)
    .as("latest");

  const rows = await db
    .select({ record: records, firstCreatedAt: latest.firstCreatedAt })
    .from(records)
    .innerJoin(
      latest,
      and(eq(records.recordId, latest.recordId), eq(records.version, latest.maxVersion)),
    )
    .where(and(filter, vaultId === undefined ? undefined : eq(records.vaultId, vaultId)));

  return rows.map(({ record, firstCreatedAt }) => ({
    ...record,
    firstCreatedAt: firstCreatedAt ?? undefined,
  }));
}

/** Where every record id on the device lives and whether its latest version is a tombstone. */
export type RecordHead = { recordId: string; vaultId: string; deleted: boolean };

export async function getRecordHeads(db: LocalDb): Promise<RecordHead[]> {
  const latest = db
    .select({ recordId: records.recordId, maxVersion: max(records.version).as("maxVersion") })
    .from(records)
    .groupBy(records.recordId)
    .as("latest");

  const rows = await db
    .select({
      recordId: records.recordId,
      vaultId: records.vaultId,
      deletedAt: records.deleted_at,
    })
    .from(records)
    .innerJoin(
      latest,
      and(eq(records.recordId, latest.recordId), eq(records.version, latest.maxVersion)),
    );
  return rows.map(({ deletedAt, ...head }) => ({ ...head, deleted: deletedAt !== null }));
}

/** The latest version of one record (deleted or not), with its first creation date. */
export async function getByRecordId(
  recordId: string,
  db: LocalDb,
): Promise<LocalRecordVersion | undefined> {
  const versions = alias(records, "versions");
  const firstCreatedAt = db
    .select({ value: min(versions.created_at) })
    .from(versions)
    .where(eq(versions.recordId, records.recordId));

  const row = await db
    .select({ record: records, firstCreatedAt: sql<string | null>`(${firstCreatedAt})` })
    .from(records)
    .where(eq(records.recordId, recordId))
    .orderBy(desc(records.version))
    .limit(1)
    .get();

  return row && { ...row.record, firstCreatedAt: row.firstCreatedAt ?? undefined };
}
