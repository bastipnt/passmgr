import type { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getClient,
  insertKey,
  insertRecord,
  insertUser,
  insertVault,
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
          "passwordKekSalt", "encryptedAccountKey", "accountKeyEncryptionNonce",
          "encryptedAccountKeyRecovery", "accountKeyEncryptionNonceRecovery")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          orphan.keySetId,
          orphan.userId,
          orphan.recoveryKekSalt,
          JSON.stringify(orphan.passwordKekParams),
          orphan.passwordKekSalt,
          orphan.encryptedAccountKey,
          orphan.accountKeyEncryptionNonce,
          orphan.encryptedAccountKeyRecovery,
          orphan.accountKeyEncryptionNonceRecovery,
        ],
      ),
    ).rejects.toMatchObject({ code: FK_VIOLATION });
  });

  it.each([
    ["userId not in users", "user"],
    ["vaultId not in vaults", "vault"],
  ])("rejects records row with %s", async (_label, missing) => {
    const owner = await insertUser(client);
    const vaultId = await insertVault(client, owner.userId);
    const orphan = makeRecordRow(missing === "user" ? crypto.randomUUID() : owner.userId, {
      vaultId: missing === "vault" ? crypto.randomUUID() : vaultId,
    });
    await expect(
      client.query(
        `INSERT INTO "records" ("rowId", "recordId", "vaultId", "userId", "encryptedData",
          "encryptionNonce", "cryptoVersion", "version", "seq", "clientChangeId", "clientUpdatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          orphan.rowId,
          orphan.recordId,
          orphan.vaultId,
          orphan.userId,
          orphan.encryptedData,
          orphan.encryptionNonce,
          orphan.cryptoVersion,
          orphan.version,
          orphan.seq,
          orphan.clientChangeId,
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

  it("deleting a vault removes its records", async () => {
    const user = await insertUser(client);
    const vaultId = await insertVault(client, user.userId);
    await insertRecord(client, user.userId, { vaultId });

    await client.query(`DELETE FROM "vaults" WHERE "vaultId" = $1`, [vaultId]);

    const left = await client.query(
      `SELECT count(*)::int AS n FROM "records" WHERE "vaultId" = $1`,
      [vaultId],
    );
    expect(left.rows[0].n).toBe(0);
  });
});
