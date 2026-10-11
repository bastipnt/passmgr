import { createVault, SESSION_SIGNED_OUT } from "@repo/crypto";
import {
  db,
  keysTable,
  recordsTable,
  userKeyPairsTable,
  usersTable,
  vaultMembersTable,
  vaultsTable,
} from "@repo/db";
import type { PushChange, VaultRole } from "@repo/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { callSigned, deleteChange, loginAndGetAuthKey, putChange, register } from "./_helpers";

// Deleting an account (GDPR): everything stored for it goes, for good; shared
// vaults other people are in stay with them.

type User = Awaited<ReturnType<typeof loginAndGetAuthKey>> & {
  email: string;
  userId: string;
  accountKey: Uint8Array;
  personalVaultId: string;
};

async function signUp(email: string): Promise<User> {
  const { accountKey } = await register(email, "pw");
  const session = await loginAndGetAuthKey(email, "pw");
  const personalVaultId = session.vaultKeys[0]!.vaultId;
  const [vault] = await db
    .select({ ownerId: vaultsTable.ownerId })
    .from(vaultsTable)
    .where(eq(vaultsTable.vaultId, personalVaultId));
  return { ...session, email, userId: vault!.ownerId, accountKey, personalVaultId };
}

async function call(user: User, type: "mutation" | "query", path: string, input?: unknown) {
  return await callSigned(
    user.sessionId,
    user.authKey,
    type,
    path,
    input as Record<string, unknown> | string | undefined,
  );
}

async function deleteAccount(user: User) {
  return await (await call(user, "mutation", "user.deleteAccount")).user.deleteAccount();
}

async function push(user: User, ...changes: PushChange[]) {
  const input = { changes };
  return (await (await call(user, "mutation", "record.push", input)).record.push(input)).results;
}

async function createSharedVault(owner: User) {
  const vault = createVault(owner.accountKey, { name: "Team" });
  await (await call(owner, "mutation", "vault.create", vault)).vault.create(vault);
  return vault.vaultId;
}

/** Make `user` a member straight in the database (the crypto of joining is tested elsewhere). */
async function addMember(
  vaultId: string,
  user: User,
  role: VaultRole,
  status: "active" | "pending" = "active",
  sealedBy?: User,
) {
  await db.insert(vaultMembersTable).values({
    vaultId,
    userId: user.userId,
    role,
    status,
    keyVersion: 1,
    ...(status === "active"
      ? { encryptedVaultKey: crypto.randomUUID(), vaultKeyEncryptionNonce: crypto.randomUUID() }
      : {
          sealedVaultKey: crypto.randomUUID(),
          sealedKeyVersion: 1,
          sealedToKeyVersion: 1,
          sealedByUserId: sealedBy?.userId,
          sealedByKeyVersion: 1,
        }),
  });
}

async function rowsOf(userId: string) {
  return {
    users: await db.select().from(usersTable).where(eq(usersTable.userId, userId)),
    keys: await db.select().from(keysTable).where(eq(keysTable.userId, userId)),
    keyPairs: await db.select().from(userKeyPairsTable).where(eq(userKeyPairsTable.userId, userId)),
    vaults: await db.select().from(vaultsTable).where(eq(vaultsTable.ownerId, userId)),
    members: await db.select().from(vaultMembersTable).where(eq(vaultMembersTable.userId, userId)),
    records: await db.select().from(recordsTable).where(eq(recordsTable.userId, userId)),
  };
}

async function vaultRow(vaultId: string) {
  const [row] = await db.select().from(vaultsTable).where(eq(vaultsTable.vaultId, vaultId));
  return row;
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("user.deleteAccount", () => {
  it("hard-deletes the user, keys, keypair, personal vault with its history and every session", async () => {
    const alice = await signUp("alice@example.com");
    const otherDevice = await loginAndGetAuthKey(alice.email, "pw");
    const put = putChange(alice.personalVaultId);
    await push(alice, put);
    await push(alice, deleteChange(alice.personalVaultId, put.recordId, 1));
    // A vault she deleted earlier stays as rows until now.
    const deletedVault = await createSharedVault(alice);
    await (await call(alice, "mutation", "vault.delete", { vaultId: deletedVault })).vault.delete({
      vaultId: deletedVault,
    });

    expect(await deleteAccount(alice)).toEqual({ ok: true });

    expect(await rowsOf(alice.userId)).toEqual({
      users: [],
      keys: [],
      keyPairs: [],
      vaults: [],
      members: [],
      records: [],
    });
    expect(await db.select().from(recordsTable)).toEqual([]);
    expect(await vaultRow(deletedVault)).toBeUndefined();

    // Other devices are signed out (they lock); this one's session just ends.
    const other = await callSigned(
      otherDevice.sessionId,
      otherDevice.authKey,
      "query",
      "user.heartbeat",
      undefined,
    );
    await expect(other.user.heartbeat()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: SESSION_SIGNED_OUT,
    });
    const own = await call(alice, "query", "user.heartbeat");
    await expect(own.user.heartbeat()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    // The password no longer logs in; the email is free for a new account.
    await expect(loginAndGetAuthKey(alice.email, "pw")).rejects.toThrow();
    await expect(register(alice.email, "pw")).resolves.toBeDefined();
  });

  it("refuses while the user alone owns a shared vault others are in, and deletes nothing", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const team = await createSharedVault(alice);
    await addMember(team, bob, "manage");

    const error = await deleteAccount(alice).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED", message: "sole_owner" });
    // The client gets them as `data.vaultIds` (errorFormatter).
    expect((error as { cause: { vaultIds: string[] } }).cause.vaultIds).toEqual([team]);

    const rows = await rowsOf(alice.userId);
    expect(rows.users).toHaveLength(1);
    expect(rows.vaults).toHaveLength(2);
    expect(await vaultRow(team)).toMatchObject({ keyRotationNeeded: false });
  });

  it("leaves a vault with another owner: its records stay, author cleared, rotation due", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const team = await createSharedVault(alice);
    await addMember(team, bob, "owner");
    const put = putChange(team);
    expect(await push(alice, put)).toMatchObject([{ status: "applied" }]);

    await deleteAccount(alice);

    // Bob owns it now (the `ownerId` cascade would have taken it along).
    expect(await vaultRow(team)).toMatchObject({ ownerId: bob.userId, keyRotationNeeded: true });
    expect(
      await db.select().from(vaultMembersTable).where(eq(vaultMembersTable.vaultId, team)),
    ).toEqual([expect.objectContaining({ userId: bob.userId })]);
    expect(
      await db.select().from(recordsTable).where(eq(recordsTable.recordId, put.recordId)),
    ).toEqual([expect.objectContaining({ vaultId: team, userId: null })]);
  });

  it("keeps a vault whose recorded owner was demoted, handing `ownerId` to an active owner", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const team = await createSharedVault(alice);
    await addMember(team, bob, "owner");
    // Alice was demoted and left; `ownerId` still names her.
    await db.delete(vaultMembersTable).where(eq(vaultMembersTable.userId, alice.userId));

    await deleteAccount(alice);

    expect(await vaultRow(team)).toMatchObject({ ownerId: bob.userId, keyRotationNeeded: false });
  });

  it("deletes a shared vault nobody else is active in, with its pending invites", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const solo = await createSharedVault(alice);
    await addMember(solo, bob, "write", "pending", alice);
    await push(alice, putChange(solo));

    await deleteAccount(alice);

    expect(await vaultRow(solo)).toBeUndefined();
    expect(await db.select().from(recordsTable).where(eq(recordsTable.vaultId, solo))).toEqual([]);
    expect(await rowsOf(bob.userId)).toMatchObject({ members: [expect.anything()] });
  });

  it("withdraws the invites the user sent into vaults that stay", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const carol = await signUp("carol@example.com");
    const team = await createSharedVault(bob);
    await addMember(team, alice, "manage");
    await addMember(team, carol, "read", "pending", alice);

    await deleteAccount(alice);

    expect(
      (await db.select().from(vaultMembersTable).where(eq(vaultMembersTable.vaultId, team))).map(
        (m) => m.userId,
      ),
    ).toEqual([bob.userId]);
    expect(await vaultRow(team)).toMatchObject({ ownerId: bob.userId, keyRotationNeeded: true });
  });
});
