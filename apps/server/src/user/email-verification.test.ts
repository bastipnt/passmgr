import { db, usersTable } from "@repo/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../../test/setup/db-helpers";
import { redis } from "../redis";
import { cacheEmailVerified, getSession, setSession } from "../util/redis-utils";
import { setEmailVerifiedAt } from "./email-verification";

async function insertUser(emailVerifiedAt: Date | null) {
  const [user] = await db
    .insert(usersTable)
    .values({
      encryptedEmail: "e",
      emailNonce: "n",
      emailEncryptionKeySalt: "s",
      emailHash: "h",
      registrationRecord: "r",
      emailVerifiedAt,
    })
    .returning({ userId: usersTable.userId });
  if (!user) throw new Error("insert failed");
  return user.userId;
}

async function column(userId: string) {
  const [row] = await db
    .select({ at: usersTable.emailVerifiedAt })
    .from(usersTable)
    .where(eq(usersTable.userId, userId));
  return row?.at;
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("setEmailVerifiedAt", () => {
  it("keeps the first verification time", async () => {
    const userId = await insertUser(null);
    const first = new Date("2026-01-01T00:00:00Z");

    await setEmailVerifiedAt(userId, first);
    await setEmailVerifiedAt(userId, new Date("2026-02-02T00:00:00Z"));

    expect(await column(userId)).toEqual(first);
  });

  it("clearing it also drops the cached verification the session reads", async () => {
    const userId = await insertUser(new Date());
    const sessionId = await setSession({ userId, rawAuthKey: "k", authenticatedAt: Date.now() });
    await cacheEmailVerified(userId);
    expect(await getSession(sessionId)).toMatchObject({ emailVerified: true });

    await setEmailVerifiedAt(userId, null);

    expect(await column(userId)).toBeNull();
    expect(await getSession(sessionId)).toMatchObject({ emailVerified: false });
  });
});
