import { createVault, unwrapVaultKey, wrapVaultKey } from "@repo/crypto";
import { db, vaultMembersTable, vaultsTable } from "@repo/db";
import type { VaultRole } from "@repo/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { callSigned, loginAndGetAuthKey, register } from "./_helpers";

type User = Awaited<ReturnType<typeof loginAndGetAuthKey>> & {
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
  return { ...session, userId: vault!.ownerId, accountKey, personalVaultId };
}

function as(user: User, type: "mutation" | "query", path: string, input?: unknown) {
  return callSigned(
    user.sessionId,
    user.authKey,
    type,
    path,
    input as Record<string, unknown> | string | undefined,
  );
}

function recordInput(vaultId: string, data = "ENC") {
  return {
    recordId: crypto.randomUUID(),
    vaultId,
    encryptedData: data,
    encryptionNonce: "NONCE",
    cryptoVersion: 1,
    clientUpdatedAt: new Date().toISOString(),
  };
}

async function createRecord(user: User, vaultId: string, data?: string) {
  const input = recordInput(vaultId, data);
  return await (await as(user, "mutation", "record.create", input)).record.create(input);
}

async function sync(user: User, cursors: Record<string, string> = {}) {
  const input = { cursors };
  return await (await as(user, "query", "record.sync", input)).record.sync(input);
}

async function createVaultFor(user: User, name = "Work") {
  const vault = createVault(user.accountKey, { name });
  await (await as(user, "mutation", "vault.create", vault)).vault.create(vault);
  return vault;
}

/** Make `member` part of `owner`'s vault, as an accepted invite would. */
async function addMember(
  owner: User,
  vault: ReturnType<typeof createVault>,
  member: User,
  role: VaultRole,
  status: "active" | "pending" = "active",
) {
  const vaultKey = unwrapVaultKey(owner.accountKey, vault);
  const wrap = wrapVaultKey(member.accountKey, vaultKey, vault.vaultId, 1);
  await db.insert(vaultMembersTable).values({ ...wrap, userId: member.userId, role, status });
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("vaults", () => {
  it("login hands out the personal vault with role and encrypted metadata", async () => {
    const alice = await signUp("alice@example.com");

    expect(alice.vaultKeys).toEqual([
      expect.objectContaining({
        kind: "personal",
        role: "owner",
        encryptedMeta: expect.any(String),
        metaEncryptionNonce: expect.any(String),
      }),
    ]);
  });

  it("vault.create adds an owned vault that list and sync return", async () => {
    const alice = await signUp("alice@example.com");
    const work = await createVaultFor(alice);

    const listed = await (await as(alice, "query", "vault.list")).vault.list();
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vaultId: alice.personalVaultId,
          kind: "personal",
          role: "owner",
        }),
        expect.objectContaining({ vaultId: work.vaultId, kind: "shared", role: "owner" }),
      ]),
    );
    expect((await sync(alice)).vaults).toHaveLength(2);
  });

  it("vault.create refuses an id that is taken", async () => {
    const alice = await signUp("alice@example.com");
    const work = await createVaultFor(alice);
    const again = { ...createVault(alice.accountKey, { name: "x" }), vaultId: work.vaultId };

    await expect(
      (await as(alice, "mutation", "vault.create", again)).vault.create(again),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("updateMeta is for owners and managers only", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const work = await createVaultFor(alice);
    await addMember(alice, work, bob, "write");

    const meta = {
      vaultId: work.vaultId,
      encryptedMeta: "AAAA",
      metaEncryptionNonce: work.metaEncryptionNonce,
    };
    await expect(
      (await as(bob, "mutation", "vault.updateMeta", meta)).vault.updateMeta(meta),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await (await as(alice, "mutation", "vault.updateMeta", meta)).vault.updateMeta(meta);
    const listed = await (await as(bob, "query", "vault.list")).vault.list();
    expect(listed.find((v) => v.vaultId === work.vaultId)?.encryptedMeta).toBe("AAAA");
  });
});

describe("record access through vault membership", () => {
  it("a non-member can't write into, read or probe another user's vault", async () => {
    const alice = await signUp("alice@example.com");
    const mallory = await signUp("mallory@example.com");
    const record = await createRecord(alice, alice.personalVaultId);

    const input = recordInput(alice.personalVaultId);
    await expect(
      (await as(mallory, "mutation", "record.create", input)).record.create(input),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      (await as(mallory, "query", "record.history", record.recordId)).record.history(
        record.recordId,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await sync(mallory)).records).toEqual([]);
  });

  it("a read member syncs and reads the vault but can't change it", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const work = await createVaultFor(alice);
    await addMember(alice, work, bob, "read");
    const record = await createRecord(alice, work.vaultId);

    const pulled = await sync(bob);
    expect(pulled.records.map((r) => r.recordId)).toEqual([record.recordId]);
    expect(pulled.vaults.find((v) => v.vaultId === work.vaultId)?.role).toBe("read");

    const input = recordInput(work.vaultId);
    await expect(
      (await as(bob, "mutation", "record.create", input)).record.create(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      (await as(bob, "mutation", "record.delete", record.recordId)).record.delete(record.recordId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a write member updates a record in a vault they don't own", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const work = await createVaultFor(alice);
    await addMember(alice, work, bob, "write");
    const record = await createRecord(alice, work.vaultId);

    const update = {
      recordId: record.recordId,
      encryptedData: "ENC-V2",
      encryptionNonce: "NONCE-V2",
      cryptoVersion: 1,
      version: 1,
      clientUpdatedAt: new Date().toISOString(),
    };
    const updated = await (await as(bob, "mutation", "record.update", update)).record.update(
      update,
    );

    expect(updated).toMatchObject({ vaultId: work.vaultId, version: 2 });
  });

  it("a pending invite grants nothing", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const work = await createVaultFor(alice);
    await addMember(alice, work, bob, "write", "pending");
    await createRecord(alice, work.vaultId);

    const pulled = await sync(bob);
    expect(pulled.vaults.map((v) => v.vaultId)).toEqual([bob.personalVaultId]);
    expect(pulled.records).toEqual([]);
  });
});

describe("record.sync per vault", () => {
  it("pulls a vault without a cursor in full and the others from their cursor", async () => {
    const alice = await signUp("alice@example.com");
    const old = await createRecord(alice, alice.personalVaultId);
    const first = await sync(alice);
    expect(first.records.map((r) => r.recordId)).toEqual([old.recordId]);

    const work = await createVaultFor(alice);
    const inWork = await createRecord(alice, work.vaultId);
    const newer = await createRecord(alice, alice.personalVaultId);

    // The personal vault from its cursor; the work vault is new to this device.
    const second = await sync(alice, { [alice.personalVaultId]: first.serverTimestamp });
    expect(second.records.map((r) => r.recordId)).toHaveLength(2);
    expect(second.records.map((r) => r.recordId)).toEqual(
      expect.arrayContaining([inWork.recordId, newer.recordId]),
    );
  });

  it("ignores cursors for vaults the user isn't a member of", async () => {
    const alice = await signUp("alice@example.com");
    await createRecord(alice, alice.personalVaultId);

    const pulled = await sync(alice, { [crypto.randomUUID()]: new Date().toISOString() });
    expect(pulled.records).toHaveLength(1);
  });
});

describe("record.move", () => {
  async function move(user: User, recordId: string, version: number, targetVaultId: string) {
    const input = { recordId, version, target: recordInput(targetVaultId, "MOVED") };
    const caller = await as(user, "mutation", "record.move", input);
    return { input, result: caller.record.move(input) };
  }

  it("creates the record in the target and tombstones the source, which keeps its history", async () => {
    const alice = await signUp("alice@example.com");
    const work = await createVaultFor(alice);
    const record = await createRecord(alice, alice.personalVaultId);

    const { input, result } = await move(alice, record.recordId, 1, work.vaultId);
    expect(await result).toMatchObject({
      recordId: input.target.recordId,
      vaultId: work.vaultId,
      version: 1,
      encryptedData: "MOVED",
    });

    const history = await (
      await as(alice, "query", "record.history", record.recordId)
    ).record.history(record.recordId);
    expect(history.map((h) => [h.version, h.vaultId, h.deleted_at !== null])).toEqual([
      [2, alice.personalVaultId, true],
      [1, alice.personalVaultId, false],
    ]);
  });

  it("refuses a stale source version", async () => {
    const alice = await signUp("alice@example.com");
    const work = await createVaultFor(alice);
    const record = await createRecord(alice, alice.personalVaultId);

    const { result } = await move(alice, record.recordId, 7, work.vaultId);
    await expect(result).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a target vault the user can't write to, and changes nothing", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const record = await createRecord(alice, alice.personalVaultId);

    const { result } = await move(alice, record.recordId, 1, bob.personalVaultId);
    await expect(result).rejects.toMatchObject({ code: "NOT_FOUND" });

    const history = await (
      await as(alice, "query", "record.history", record.recordId)
    ).record.history(record.recordId);
    expect(history).toHaveLength(1);
  });

  it("refuses a move within the same vault", async () => {
    const alice = await signUp("alice@example.com");
    const record = await createRecord(alice, alice.personalVaultId);

    const { result } = await move(alice, record.recordId, 1, alice.personalVaultId);
    await expect(result).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("answers a target id that is taken with CONFLICT and changes nothing", async () => {
    const alice = await signUp("alice@example.com");
    const work = await createVaultFor(alice);
    const record = await createRecord(alice, alice.personalVaultId);
    const other = await createRecord(alice, work.vaultId);

    const input = {
      recordId: record.recordId,
      version: 1,
      target: { ...recordInput(work.vaultId), recordId: other.recordId },
    };
    await expect(
      (await as(alice, "mutation", "record.move", input)).record.move(input),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const history = await (
      await as(alice, "query", "record.history", record.recordId)
    ).record.history(record.recordId);
    expect(history).toHaveLength(1);
  });
});

describe("record id collisions", () => {
  it("record.create answers an id that is taken, even in a foreign vault, with CONFLICT", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const record = await createRecord(alice, alice.personalVaultId);

    const input = { ...recordInput(bob.personalVaultId), recordId: record.recordId };
    await expect(
      (await as(bob, "mutation", "record.create", input)).record.create(input),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("two updates racing for the same next version: one wins, the other gets CONFLICT", async () => {
    const alice = await signUp("alice@example.com");
    const record = await createRecord(alice, alice.personalVaultId);

    const update = (data: string) => ({
      recordId: record.recordId,
      encryptedData: data,
      encryptionNonce: "NONCE",
      cryptoVersion: 1,
      version: 1,
      clientUpdatedAt: new Date().toISOString(),
    });
    const [a, b] = [update("A"), update("B")];
    const results = await Promise.allSettled([
      (await as(alice, "mutation", "record.update", a)).record.update(a),
      (await as(alice, "mutation", "record.update", b)).record.update(b),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: expect.objectContaining({ code: "CONFLICT" }),
    });
  });
});
