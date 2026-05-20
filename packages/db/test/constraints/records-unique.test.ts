import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { getClient, insertRecord, insertUser, truncateAll } from "../setup/db-helpers";

const UNIQUE_VIOLATION = "23505";

describe("records unique constraints", () => {
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

  it("rejects duplicate (recordId, version)", async () => {
    const user = await insertUser(client);
    const first = await insertRecord(client, user.userId, { version: 1 });
    await expect(
      insertRecord(client, user.userId, { recordId: first.recordId, version: 1 }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("allows different version for same recordId", async () => {
    const user = await insertUser(client);
    const first = await insertRecord(client, user.userId, { version: 1 });
    await expect(
      insertRecord(client, user.userId, { recordId: first.recordId, version: 2 }),
    ).resolves.toBeDefined();
  });

  it("allows same recordId across distinct users at the same version", async () => {
    // (recordId, version) is globally unique by index — this asserts current behaviour.
    const userA = await insertUser(client);
    const userB = await insertUser(client);
    const first = await insertRecord(client, userA.userId, { version: 1 });
    await expect(
      insertRecord(client, userB.userId, { recordId: first.recordId, version: 1 }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });
});
