import type { EncryptedRecordSchema } from "@repo/schema";
import { and, desc, eq, inArray, isNull, max, min, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { LocalDb } from "../local-db";
import { records } from "./tables";

// 10 bound columns per row: well below SQLite's variable limit per statement.
const UPSERT_CHUNK_SIZE = 500;

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
    clientUpdatedAt: sql`excluded.clientUpdatedAt`,
    created_at: sql`excluded.created_at`,
    updated_at: sql`excluded.updated_at`,
    deleted_at: sql`excluded.deleted_at`,
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

/** Run inside a transaction: large inputs span several statements. */
export async function upsertRecords(rows: EncryptedRecordSchema[], db: LocalDb): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE).map((r) => ({
      recordId: r.recordId,
      vaultId: r.vaultId,
      encryptedData: r.encryptedData,
      encryptionNonce: r.encryptionNonce,
      cryptoVersion: r.cryptoVersion,
      version: r.version,
      clientUpdatedAt: r.clientUpdatedAt,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at,
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
): Promise<EncryptedRecordSchema[]> {
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
    .where(
      and(
        isNull(records.deleted_at),
        vaultId === undefined ? undefined : eq(records.vaultId, vaultId),
      ),
    );

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
): Promise<EncryptedRecordSchema | undefined> {
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
