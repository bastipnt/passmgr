import type { SqlDriver } from "../driver";

export const CREATE_SYNC_META_SCHEMA_SQL = /* sql */ `
  CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

export async function clearSyncTable(db: SqlDriver) {
  await db.run(`DELETE FROM sync_meta`);
}

export async function getLastSyncTimestamp(db: SqlDriver): Promise<string | null> {
  const rows = await db.all<{ value: string }>(/* sql */ `
    SELECT value FROM sync_meta WHERE key = 'lastSyncedAt'
  `);
  return rows[0]?.value ?? null;
}

export async function setLastSyncTimestamp(ts: string, db: SqlDriver): Promise<void> {
  await db.run(
    /* sql */ `INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('lastSyncedAt', ?)`,
    [ts],
  );
}
