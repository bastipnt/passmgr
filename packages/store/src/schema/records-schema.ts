import type { EncryptedRecordSchema } from "@repo/schema";
import type { SqlDriver } from "../driver";

export const CREATE_RECORDS_SCHEMA_SQL = /* sql */ `
  CREATE TABLE IF NOT EXISTS records (
    recordId TEXT NOT NULL,

    encryptedData TEXT NOT NULL,
    encryptionNonce TEXT NOT NULL,

    cryptoVersion INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1,

    clientUpdatedAt TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT,

    PRIMARY KEY (recordId, version)
  );
`;

export async function clearRecordsTable(db: SqlDriver) {
  await db.run(`DELETE FROM records`);
}

export async function upsertRecords(
  records: EncryptedRecordSchema[],
  db: SqlDriver,
): Promise<void> {
  if (records.length === 0) return;

  await db.transaction(async (tx) => {
    for (const record of records) {
      await tx.run(
        /* sql */ `
          INSERT OR REPLACE INTO records (
            recordId, encryptedData, encryptionNonce, cryptoVersion,
            version, clientUpdatedAt, created_at, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          record.recordId,
          record.encryptedData,
          record.encryptionNonce,
          record.cryptoVersion,
          record.version,
          record.clientUpdatedAt,
          record.created_at,
          record.updated_at,
          record.deleted_at,
        ],
      );
    }
  });
}

export async function getAllRecordsLatest(db: SqlDriver): Promise<EncryptedRecordSchema[]> {
  return await db.all<EncryptedRecordSchema>(/* sql */ `
    SELECT r.*
    FROM records r
    INNER JOIN (
      SELECT recordId, MAX(version) AS maxVersion
      FROM records
      GROUP BY recordId
    ) latest ON r.recordId = latest.recordId AND r.version = latest.maxVersion
    WHERE r.deleted_at IS NULL
  `);
}

export async function getByRecordId(
  recordId: string,
  db: SqlDriver,
): Promise<EncryptedRecordSchema | undefined> {
  const rows = await db.all<EncryptedRecordSchema>(
    /* sql */ `
      SELECT * FROM records
      WHERE recordId = ?
      ORDER BY version DESC
      LIMIT 1
    `,
    [recordId],
  );
  return rows[0];
}
