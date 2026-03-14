import type { SQLocal } from "sqlocal";

export const CREATE_SYNC_META_SCHEMA_SQL = /* sql */ `
  CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

export async function clearSyncTable(db: SQLocal) {
  await db.sql`DELETE FROM sync_meta`;
}

export async function getLastSyncTimestamp(db: SQLocal): Promise<string | null> {
  const rows = await db.sql<{ value: string }> /* sql */ `
    SELECT value FROM sync_meta WHERE key = 'lastSyncedAt'
  `;
  return rows[0]?.value ?? null;
}

export async function setLastSyncTimestamp(ts: string, db: SQLocal): Promise<void> {
  await db.sql`
    INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastSyncedAt', ${ts})
  `;
}
