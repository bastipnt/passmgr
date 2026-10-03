import type { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getClient,
  insertUser,
  insertVault,
  insertVaultMember,
  truncateAll,
} from "../setup/db-helpers";

const UNIQUE_VIOLATION = "23505";
const FK_VIOLATION = "23503";

describe("vault constraints", () => {
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

  it("allows one personal vault per user, plus any number of shared ones", async () => {
    const user = await insertUser(client);
    await insertVault(client, user.userId, "personal");
    await insertVault(client, user.userId, "shared");
    await insertVault(client, user.userId, "shared");

    await expect(insertVault(client, user.userId, "personal")).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
  });

  it("allows a new personal vault once the old one is deleted", async () => {
    const user = await insertUser(client);
    const old = await insertVault(client, user.userId, "personal");
    await client.query(`UPDATE "vaults" SET "deleted_at" = now() WHERE "vaultId" = $1`, [old]);

    await expect(insertVault(client, user.userId, "personal")).resolves.toBeTruthy();
  });

  it("rejects a member of a vault that doesn't exist", async () => {
    const user = await insertUser(client);

    await expect(insertVaultMember(client, crypto.randomUUID(), user.userId)).rejects.toMatchObject(
      { code: FK_VIOLATION },
    );
  });

  it("rejects the same member twice", async () => {
    const user = await insertUser(client);
    const vaultId = await insertVault(client, user.userId);
    await insertVaultMember(client, vaultId, user.userId);

    await expect(insertVaultMember(client, vaultId, user.userId)).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
  });

  it("deleting a user removes their vaults and memberships", async () => {
    const owner = await insertUser(client);
    const member = await insertUser(client);
    const vaultId = await insertVault(client, owner.userId, "shared");
    await insertVaultMember(client, vaultId, owner.userId);
    await insertVaultMember(client, vaultId, member.userId, "read");

    await client.query(`DELETE FROM "users" WHERE "userId" = $1`, [owner.userId]);

    expect((await client.query(`SELECT 1 FROM "vaults"`)).rowCount).toBe(0);
    expect((await client.query(`SELECT 1 FROM "vault_members"`)).rowCount).toBe(0);
  });
});
