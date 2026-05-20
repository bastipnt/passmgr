import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import {
  getClient,
  insertKey,
  insertUser,
  makeKeyRow,
  truncateAll,
  type KeyRow,
} from "../setup/db-helpers";

const UNIQUE_VIOLATION = "23505";

async function attemptInsert(client: Client, row: KeyRow): Promise<void> {
  await client.query(
    `INSERT INTO "keys" ("keySetId", "userId", "recoveryKekSalt", "passwordKekParams",
      "passwordKekSalt", "encryptedVaultKey", "vaultKeyEncryptionNonce",
      "encryptedVaultKeyRecovery", "vaultKeyEncryptionNonceRecovery")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.keySetId,
      row.userId,
      row.recoveryKekSalt,
      JSON.stringify(row.passwordKekParams),
      row.passwordKekSalt,
      row.encryptedVaultKey,
      row.vaultKeyEncryptionNonce,
      row.encryptedVaultKeyRecovery,
      row.vaultKeyEncryptionNonceRecovery,
    ],
  );
}

describe("keys unique constraints", () => {
  let client: Client;

  beforeAll(async () => {
    client = await getClient();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await truncateAll(client);
  });

  const uniqueFields: Array<keyof KeyRow> = [
    "recoveryKekSalt",
    "passwordKekSalt",
    "encryptedVaultKey",
    "vaultKeyEncryptionNonce",
    "encryptedVaultKeyRecovery",
    "vaultKeyEncryptionNonceRecovery",
  ];

  for (const field of uniqueFields) {
    it(`rejects duplicate ${field}`, async () => {
      const userA = await insertUser(client);
      const userB = await insertUser(client);
      const first = await insertKey(client, userA.userId);
      const dupe = makeKeyRow(userB.userId, { [field]: first[field] } as Partial<KeyRow>);
      await expect(attemptInsert(client, dupe)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });
  }

  it("allows distinct keys for two users", async () => {
    const userA = await insertUser(client);
    const userB = await insertUser(client);
    await insertKey(client, userA.userId);
    await expect(insertKey(client, userB.userId)).resolves.toBeDefined();
  });
});
