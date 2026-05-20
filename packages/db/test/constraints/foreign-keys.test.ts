import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import {
  getClient,
  insertKey,
  insertRecord,
  insertUser,
  makeKeyRow,
  makeRecordRow,
  truncateAll,
} from "../setup/db-helpers";

const FK_VIOLATION = "23503";

describe("foreign-key constraints", () => {
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

  it("rejects keys row with userId not in users", async () => {
    const orphan = makeKeyRow(crypto.randomUUID());
    await expect(
      client.query(
        `INSERT INTO "keys" ("keySetId", "userId", "recoveryKekSalt", "passwordKekParams",
          "passwordKekSalt", "encryptedVaultKey", "vaultKeyEncryptionNonce",
          "encryptedVaultKeyRecovery", "vaultKeyEncryptionNonceRecovery")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          orphan.keySetId,
          orphan.userId,
          orphan.recoveryKekSalt,
          JSON.stringify(orphan.passwordKekParams),
          orphan.passwordKekSalt,
          orphan.encryptedVaultKey,
          orphan.vaultKeyEncryptionNonce,
          orphan.encryptedVaultKeyRecovery,
          orphan.vaultKeyEncryptionNonceRecovery,
        ],
      ),
    ).rejects.toMatchObject({ code: FK_VIOLATION });
  });

  it("rejects records row with userId not in users", async () => {
    const orphan = makeRecordRow(crypto.randomUUID());
    await expect(
      client.query(
        `INSERT INTO "records" ("rowId", "recordId", "userId", "encryptedData", "encryptionNonce",
          "cryptoVersion", "version", "clientUpdatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          orphan.rowId,
          orphan.recordId,
          orphan.userId,
          orphan.encryptedData,
          orphan.encryptionNonce,
          orphan.cryptoVersion,
          orphan.version,
          orphan.clientUpdatedAt,
        ],
      ),
    ).rejects.toMatchObject({ code: FK_VIOLATION });
  });

  it("cascades delete from users to keys + records", async () => {
    const user = await insertUser(client);
    await insertKey(client, user.userId);
    await insertRecord(client, user.userId);
    await insertRecord(client, user.userId, { version: 2 });

    await client.query(`DELETE FROM "users" WHERE "userId" = $1`, [user.userId]);

    const keysLeft = await client.query(
      `SELECT count(*)::int AS n FROM "keys" WHERE "userId" = $1`,
      [user.userId],
    );
    const recordsLeft = await client.query(
      `SELECT count(*)::int AS n FROM "records" WHERE "userId" = $1`,
      [user.userId],
    );
    expect(keysLeft.rows[0].n).toBe(0);
    expect(recordsLeft.rows[0].n).toBe(0);
  });
});
