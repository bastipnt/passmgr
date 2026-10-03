import { db, userKeyPairsTable, usersTable } from "@repo/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { buildTestContext } from "../setup/test-context";
import { callSigned, createCaller, loginAndGetAuthKey, register } from "./_helpers";

const password = "correct horse battery staple";

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

async function lookUp(asEmail: string, email: string) {
  const { sessionId, authKey } = await loginAndGetAuthKey(asEmail, password);
  const input = { email };
  const caller = await callSigned(sessionId, authKey, "query", "user.publicKey", input);
  return caller.user.publicKey(input);
}

describe("user.publicKey (real Postgres + Redis)", () => {
  it("returns another user's current public key, by email in any case", async () => {
    await register("alice@example.com", password);
    await register("bob@example.com", password);
    const { userKeyPair } = await loginAndGetAuthKey("bob@example.com", password);

    expect(await lookUp("alice@example.com", "  Bob@Example.com ")).toEqual({
      keyVersion: 1,
      publicKey: userKeyPair.publicKey,
    });
  });

  it("login and lookup serve the highest key version", async () => {
    await register("bob@example.com", password);
    const [current] = await db.select().from(userKeyPairsTable);
    const rotated = {
      ...current!,
      keyVersion: 2,
      publicKey: `${"B".repeat(43)}=`,
      encryptedPrivateKey: "C".repeat(64),
      privateKeyEncryptionNonce: "D".repeat(32),
    };
    await db.insert(userKeyPairsTable).values(rotated);
    await register("alice@example.com", password);

    const { userKeyPair } = await loginAndGetAuthKey("bob@example.com", password);
    expect(userKeyPair).toMatchObject({ keyVersion: 2, publicKey: rotated.publicKey });
    expect(await lookUp("alice@example.com", "bob@example.com")).toEqual({
      keyVersion: 2,
      publicKey: rotated.publicKey,
    });
  });

  it("NOT_FOUND for an email without an account", async () => {
    await register("alice@example.com", password);

    await expect(lookUp("alice@example.com", "nobody@example.com")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("NOT_FOUND for a deleted account", async () => {
    await register("alice@example.com", password);
    await register("bob@example.com", password);
    const { sessionId, authKey } = await loginAndGetAuthKey("alice@example.com", password);
    const { userKeyPair } = await loginAndGetAuthKey("bob@example.com", password);
    const [bobRow] = await db
      .select()
      .from(userKeyPairsTable)
      .where(eq(userKeyPairsTable.publicKey, userKeyPair.publicKey));
    await db
      .update(usersTable)
      .set({ deleted_at: new Date() })
      .where(eq(usersTable.userId, bobRow!.userId));

    const input = { email: "bob@example.com" };
    const caller = await callSigned(sessionId, authKey, "query", "user.publicKey", input);
    await expect(caller.user.publicKey(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("UNAUTHORIZED without a session", async () => {
    await register("bob@example.com", password);
    const caller = createCaller(buildTestContext(undefined));

    await expect(caller.user.publicKey({ email: "bob@example.com" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
