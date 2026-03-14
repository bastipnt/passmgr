import type { SQLocal } from "sqlocal";
import type { EncryptedItemSchema } from "@repo/schema";

export const CREATE_ITEMS_SCHEMA_SQL = /* sql */ `
  CREATE TABLE IF NOT EXISTS items (
    itemId TEXT NOT NULL,

    encryptedData TEXT NOT NULL,
    encryptionNonce TEXT NOT NULL,

    cryptoVersion INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1,

    clientUpdatedAt TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT,

    PRIMARY KEY (itemId, version)
  );
`;

export async function clearItemsTable(db: SQLocal) {
  await db.sql`DELETE FROM items`;
}

export async function upsertItems(items: EncryptedItemSchema[], db: SQLocal): Promise<void> {
  if (items.length === 0) return;

  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.sql`
        INSERT OR REPLACE INTO items (
          itemId, encryptedData, encryptionNonce, cryptoVersion,
          version, clientUpdatedAt, created_at, updated_at, deleted_at
        ) VALUES (
          ${item.itemId}, ${item.encryptedData}, ${item.encryptionNonce}, ${item.cryptoVersion},
          ${item.version}, ${item.clientUpdatedAt}, ${item.created_at}, ${item.updated_at},
          ${item.deleted_at}
        )
      `;
    }
  });
}

export async function getAllItemsLatest(db: SQLocal): Promise<EncryptedItemSchema[]> {
  return await db.sql<EncryptedItemSchema> /* sql */ `
    SELECT i.*
    FROM items i
    INNER JOIN (
      SELECT itemId, MAX(version) AS maxVersion
      FROM items
      GROUP BY itemId
    ) latest ON i.itemId = latest.itemId AND i.version = latest.maxVersion
    WHERE i.deleted_at IS NULL
  `;
}

export async function getByItemId(
  itemId: string,
  db: SQLocal,
): Promise<EncryptedItemSchema | undefined> {
  const rows = await db.sql<EncryptedItemSchema> /* sql */ `
    SELECT * FROM items
    WHERE itemId = ${itemId}
    ORDER BY version DESC
    LIMIT 1
  `;
  return rows[0];
}
