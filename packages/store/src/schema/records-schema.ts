import type { SQLocal } from "sqlocal";
import type { EncryptedRecordSchema } from "@repo/schema";

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

export async function clearRecordsTable(db: SQLocal) {
  await db.sql`DELETE FROM records`;
}

export async function upsertRecords(records: EncryptedRecordSchema[], db: SQLocal): Promise<void> {
  if (records.length === 0) return;

  await db.transaction(async (tx) => {
    for (const record of records) {
      await tx.sql`
        INSERT OR REPLACE INTO records (
          recordId, encryptedData, encryptionNonce, cryptoVersion,
          version, clientUpdatedAt, created_at, updated_at, deleted_at
        ) VALUES (
          ${record.recordId}, ${record.encryptedData}, ${record.encryptionNonce}, ${record.cryptoVersion},
          ${record.version}, ${record.clientUpdatedAt}, ${record.created_at}, ${record.updated_at},
          ${record.deleted_at}
        )
      `;
    }
  });
}

export async function getAllRecordsLatest(db: SQLocal): Promise<EncryptedRecordSchema[]> {
  return await db.sql<EncryptedRecordSchema> /* sql */ `
    SELECT r.*
    FROM records r
    INNER JOIN (
      SELECT recordId, MAX(version) AS maxVersion
      FROM records
      GROUP BY recordId
    ) latest ON r.recordId = latest.recordId AND r.version = latest.maxVersion
    WHERE r.deleted_at IS NULL
  `;
}

export async function getByRecordId(
  recordId: string,
  db: SQLocal,
): Promise<EncryptedRecordSchema | undefined> {
  const rows = await db.sql<EncryptedRecordSchema> /* sql */ `
    SELECT * FROM records
    WHERE recordId = ${recordId}
    ORDER BY version DESC
    LIMIT 1
  `;
  return rows[0];
}
