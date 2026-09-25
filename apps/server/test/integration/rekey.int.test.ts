import { db, keysTable } from "@repo/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { FRESH_AUTH_WINDOW_MS } from "../../src/auth/auth-middleware";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { buildUserKeys } from "../setup/user-keys";
import { callSigned, loginAndGetAuthKey, register } from "./_helpers";

const email = "alice@example.com";
const password = "correct horse battery staple";

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

async function newPasswordKeys() {
  const { passwordKekParams, passwordKekSalt, encryptedVaultKey, vaultKeyEncryptionNonce } =
    await buildUserKeys(password);
  return { passwordKekParams, passwordKekSalt, encryptedVaultKey, vaultKeyEncryptionNonce };
}

async function rekey(sessionId: string, authKey: Uint8Array) {
  const input = await newPasswordKeys();
  const caller = await callSigned(sessionId, authKey, "mutation", "user.rekeyPasswordKeys", input);
  await caller.user.rekeyPasswordKeys(input);
  return input;
}

describe("user.rekeyPasswordKeys (real Postgres + Redis)", () => {
  it("closes the active key set and inserts a new version; login serves the new one", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);
    const [original] = await db.select().from(keysTable);
    if (!original) throw new Error("no key row");

    const updated = await rekey(sessionId, authKey);

    const rows = await db.select().from(keysTable).where(eq(keysTable.userId, original.userId));
    expect(rows).toHaveLength(2);
    const closed = rows.find((r) => r.keySetId === original.keySetId);
    const active = rows.find((r) => r.keySetId !== original.keySetId);
    expect(closed?.valid_to).not.toBeNull();
    expect(active).toMatchObject({ ...updated, valid_to: null });
    // Recovery copy of the vault key carries over unchanged.
    expect(active?.encryptedVaultKeyRecovery).toBe(original.encryptedVaultKeyRecovery);
    expect(active?.recoveryKekSalt).toBe(original.recoveryKekSalt);
  });

  it("rejects a session whose OPAQUE login is older than the fresh-auth window", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    const key = `session:${sessionId}`;
    const session = JSON.parse((await redis.get(key)) ?? "{}");
    session.authenticatedAt = Date.now() - FRESH_AUTH_WINDOW_MS - 1_000;
    await redis.set(key, JSON.stringify(session), "KEEPTTL");

    await expect(rekey(sessionId, authKey)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.select().from(keysTable)).toHaveLength(1);
  });

  it("concurrent rekeys leave exactly one active key set", async () => {
    await register(email, password);
    const { sessionId, authKey } = await loginAndGetAuthKey(email, password);

    await Promise.allSettled([rekey(sessionId, authKey), rekey(sessionId, authKey)]);

    const rows = await db.select().from(keysTable);
    expect(rows.filter((r) => r.valid_to === null)).toHaveLength(1);
  });
});
