import type { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getClient,
  insertKey,
  insertKeyRow,
  insertUser,
  type KeyRow,
  makeKeyRow,
  truncateAll,
} from "../setup/db-helpers";

const UNIQUE_VIOLATION = "23505";
const NOT_NULL_VIOLATION = "23502";

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
    "passwordKekSalt",
    "encryptedAccountKey",
    "accountKeyEncryptionNonce",
  ];

  for (const field of uniqueFields) {
    it(`rejects duplicate ${field}`, async () => {
      const userA = await insertUser(client);
      const userB = await insertUser(client);
      const first = await insertKey(client, userA.userId);
      const dupe = makeKeyRow(userB.userId, { [field]: first[field] } as Partial<KeyRow>);
      await expect(insertKeyRow(client, dupe)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });
  }

  it("allows distinct keys for two users", async () => {
    const userA = await insertUser(client);
    const userB = await insertUser(client);
    await insertKey(client, userA.userId);
    await expect(insertKey(client, userB.userId)).resolves.toBeDefined();
  });

  it("allows a user's new key-set version to reuse the recovery material", async () => {
    const user = await insertUser(client);
    const first = await insertKey(client, user.userId);
    await client.query(`UPDATE "keys" SET "valid_to" = now() WHERE "keySetId" = $1`, [
      first.keySetId,
    ]);
    const next = makeKeyRow(user.userId, {
      recoveryKekSalt: first.recoveryKekSalt,
      encryptedAccountKeyRecovery: first.encryptedAccountKeyRecovery,
      accountKeyEncryptionNonceRecovery: first.accountKeyEncryptionNonceRecovery,
      recoveryVerifier: first.recoveryVerifier,
    });
    await expect(insertKeyRow(client, next)).resolves.toBeUndefined();
  });

  it("rejects a second active key set for the same user", async () => {
    const user = await insertUser(client);
    await insertKey(client, user.userId);
    await expect(insertKeyRow(client, makeKeyRow(user.userId))).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
  });

  it("rejects a key set without a recovery verifier", async () => {
    const user = await insertUser(client);
    await insertKey(client, user.userId);
    await expect(
      client.query(`UPDATE "keys" SET "recoveryVerifier" = NULL WHERE "userId" = $1`, [
        user.userId,
      ]),
    ).rejects.toMatchObject({ code: NOT_NULL_VIOLATION });
  });
});
