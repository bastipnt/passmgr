import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { getClient, insertUser, makeUserRow, truncateAll } from "../setup/db-helpers";

const UNIQUE_VIOLATION = "23505";

describe("users unique constraints", () => {
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

  it("rejects duplicate encryptedEmail", async () => {
    const first = await insertUser(client);
    const dupe = makeUserRow({ encryptedEmail: first.encryptedEmail });
    await expect(
      client.query(
        `INSERT INTO "users" ("userId", "encryptedEmail", "emailNonce", "emailEncryptionKeySalt", "emailHash", "registrationRecord", "hasTwoFactorEnabled", "hasEmailVerified")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          dupe.userId,
          dupe.encryptedEmail,
          dupe.emailNonce,
          dupe.emailEncryptionKeySalt,
          dupe.emailHash,
          dupe.registrationRecord,
          dupe.hasTwoFactorEnabled,
          dupe.hasEmailVerified,
        ],
      ),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("rejects duplicate emailHash", async () => {
    const first = await insertUser(client);
    const dupe = makeUserRow({ emailHash: first.emailHash });
    await expect(
      client.query(
        `INSERT INTO "users" ("userId", "encryptedEmail", "emailNonce", "emailEncryptionKeySalt", "emailHash", "registrationRecord", "hasTwoFactorEnabled", "hasEmailVerified")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          dupe.userId,
          dupe.encryptedEmail,
          dupe.emailNonce,
          dupe.emailEncryptionKeySalt,
          dupe.emailHash,
          dupe.registrationRecord,
          dupe.hasTwoFactorEnabled,
          dupe.hasEmailVerified,
        ],
      ),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("rejects duplicate registrationRecord", async () => {
    const first = await insertUser(client);
    const dupe = makeUserRow({ registrationRecord: first.registrationRecord });
    await expect(
      client.query(
        `INSERT INTO "users" ("userId", "encryptedEmail", "emailNonce", "emailEncryptionKeySalt", "emailHash", "registrationRecord", "hasTwoFactorEnabled", "hasEmailVerified")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          dupe.userId,
          dupe.encryptedEmail,
          dupe.emailNonce,
          dupe.emailEncryptionKeySalt,
          dupe.emailHash,
          dupe.registrationRecord,
          dupe.hasTwoFactorEnabled,
          dupe.hasEmailVerified,
        ],
      ),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("allows two users with distinct unique fields", async () => {
    await insertUser(client);
    await expect(insertUser(client)).resolves.toBeDefined();
  });
});
