import {
  createVault,
  decryptVaultMeta,
  rotateVaultKey,
  unwrapPreviousVaultKey,
  unwrapVaultKey,
  wrapVaultKey,
} from "@repo/crypto";
import { db, recordsTable, vaultMembersTable, vaultsTable } from "@repo/db";
import { MIN_SYNC_RECORDS, type PushChange, type VaultRole } from "@repo/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { redis } from "../../src/redis";
import { lockVaults, nextVaultSeq } from "../../src/vault/access";
import { truncateAll } from "../setup/db-helpers";
import { callSigned, deleteChange, loginAndGetAuthKey, putChange, register } from "./_helpers";

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

async function push(user: User, ...changes: PushChange[]) {
  const input = { changes };
  return (await (await as(user, "mutation", "record.push", input)).record.push(input)).results;
}

async function createRecord(user: User, vaultId: string, data?: string) {
  const [result] = await push(user, putChange(vaultId, { data }));
  if (result?.status !== "applied") throw new Error(`not created: ${JSON.stringify(result)}`);
  return result.record;
}

async function sync(user: User, cursors: Record<string, number> = {}, limit?: number) {
  const input = { cursors, limit };
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

  it("delete is for the owner only and takes the vault and its records from every member", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const work = await createVaultFor(alice);
    await addMember(alice, work, bob, "manage");
    await createRecord(alice, work.vaultId);

    const input = { vaultId: work.vaultId };
    await expect(
      (await as(bob, "mutation", "vault.delete", input)).vault.delete(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await (await as(alice, "mutation", "vault.delete", input)).vault.delete(input);
    for (const user of [alice, bob]) {
      const pulled = await sync(user);
      expect(pulled.vaults.map((v) => v.vaultId)).not.toContain(work.vaultId);
      expect(pulled.records.filter((r) => r.vaultId === work.vaultId)).toEqual([]);
    }
    expect(await push(alice, putChange(work.vaultId))).toMatchObject([
      { status: "rejected", reason: "not_found" },
    ]);
  });

  it("delete refuses the personal vault", async () => {
    const alice = await signUp("alice@example.com");
    const input = { vaultId: alice.personalVaultId };
    await expect(
      (await as(alice, "mutation", "vault.delete", input)).vault.delete(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await sync(alice)).vaults.map((v) => v.vaultId)).toContain(alice.personalVaultId);
  });
});

describe("vault key rotation", () => {
  /** A rotation of `vault` (the user's wrap of its current key) to the next key version. */
  function rotation(user: User, vault: { vaultId: string; keyVersion: number } & Wrap) {
    const currentKey = unwrapVaultKey(user.accountKey, vault);
    return rotateVaultKey(user.accountKey, currentKey, vault.vaultId, vault.keyVersion, {
      name: "Rotated",
    });
  }
  type Wrap = Parameters<typeof unwrapVaultKey>[1];

  async function rotate(user: User, input: ReturnType<typeof rotation>) {
    await (await as(user, "mutation", "vault.rotateKey", input)).vault.rotateKey(input);
  }

  it("moves the vault to the next key, keeping the old one under the new", async () => {
    const alice = await signUp("alice@example.com");
    const work = await createVaultFor(alice);
    const oldKey = unwrapVaultKey(alice.accountKey, work);

    const rotated = rotation(alice, work);
    await rotate(alice, rotated);

    const listed = (await (await as(alice, "query", "vault.list")).vault.list()).find(
      (v) => v.vaultId === work.vaultId,
    )!;
    expect(listed).toMatchObject({ keyVersion: 2, encryptedVaultKey: rotated.encryptedVaultKey });
    expect(listed.previousKeys).toEqual([rotated.previousKey]);
    const newKey = unwrapVaultKey(alice.accountKey, listed);
    expect(unwrapPreviousVaultKey(newKey, work.vaultId, listed.previousKeys[0]!)).toEqual(oldKey);
    expect(decryptVaultMeta(newKey, work.vaultId, listed)).toEqual({ name: "Rotated" });
    // Other vaults keep an empty chain.
    expect((await sync(alice)).vaults.find((v) => v.kind === "personal")?.previousKeys).toEqual([]);
  });

  it("refuses puts under the old key afterwards, but takes deletes and earlier retries", async () => {
    const alice = await signUp("alice@example.com");
    const work = await createVaultFor(alice);
    const kept = await createRecord(alice, work.vaultId);
    const doomed = await createRecord(alice, work.vaultId);
    const first = putChange(work.vaultId);
    await push(alice, first);

    await rotate(alice, rotation(alice, work));

    const edit = { recordId: kept.recordId, baseVersion: 1 };
    expect(
      await push(
        alice,
        putChange(work.vaultId, edit),
        putChange(work.vaultId, { keyVersion: 3 }),
        deleteChange(work.vaultId, doomed.recordId, 1),
        first,
      ),
    ).toMatchObject([
      { status: "rejected", reason: "key_version" },
      { status: "rejected", reason: "key_version" },
      // A tombstone keeps its head's ciphertext, and so its key version.
      { status: "applied", record: { version: 2, keyVersion: 1, deleted_at: expect.any(String) } },
      { status: "applied", record: { recordId: first.recordId, version: 1, keyVersion: 1 } },
    ]);
    expect(await push(alice, putChange(work.vaultId, { ...edit, keyVersion: 2 }))).toMatchObject([
      { status: "applied", record: { version: 2, keyVersion: 2 } },
    ]);
    // Other vaults are untouched.
    expect(await push(alice, putChange(alice.personalVaultId))).toMatchObject([
      { status: "applied", record: { keyVersion: 1 } },
    ]);
  });

  it("answers CONFLICT to a rotation from a key version the vault has left", async () => {
    const alice = await signUp("alice@example.com");
    const work = await createVaultFor(alice);
    const stale = rotation(alice, work);
    await rotate(alice, rotation(alice, work));

    await expect(rotate(alice, stale)).rejects.toMatchObject({ code: "CONFLICT" });
    const listed = await (await as(alice, "query", "vault.list")).vault.list();
    expect(listed.find((v) => v.vaultId === work.vaultId)?.previousKeys).toHaveLength(1);
  });

  it("is for owners and managers only, and not yet with other members", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const work = await createVaultFor(alice);
    await addMember(alice, work, bob, "write");

    const bobsWrap = (await sync(bob)).vaults.find((v) => v.vaultId === work.vaultId)!;
    await expect(rotate(bob, rotation(bob, bobsWrap))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // Bob would need the new key sealed to him (sharing).
    await expect(rotate(alice, rotation(alice, work))).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});

describe("record access through vault membership", () => {
  it("a non-member can't write into, read or probe another user's vault", async () => {
    const alice = await signUp("alice@example.com");
    const mallory = await signUp("mallory@example.com");
    const record = await createRecord(alice, alice.personalVaultId);

    expect(await push(mallory, putChange(alice.personalVaultId))).toMatchObject([
      { status: "rejected", reason: "not_found" },
    ]);
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

    expect(
      await push(bob, putChange(work.vaultId), deleteChange(work.vaultId, record.recordId, 1)),
    ).toMatchObject([
      { status: "rejected", reason: "forbidden" },
      { status: "rejected", reason: "forbidden" },
    ]);
  });

  it("a write member updates a record in a vault they don't own", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const work = await createVaultFor(alice);
    await addMember(alice, work, bob, "write");
    const record = await createRecord(alice, work.vaultId);

    const update = putChange(work.vaultId, { recordId: record.recordId, baseVersion: 1 });
    expect(await push(bob, update)).toMatchObject([
      { status: "applied", record: { vaultId: work.vaultId, version: 2 } },
    ]);
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
    expect(first.cursors).toEqual({ [alice.personalVaultId]: 1 });

    const work = await createVaultFor(alice);
    const inWork = await createRecord(alice, work.vaultId);
    const newer = await createRecord(alice, alice.personalVaultId);

    // The personal vault from its cursor; the work vault is new to this device.
    const second = await sync(alice, first.cursors);
    expect(second.records.map((r) => r.recordId)).toHaveLength(2);
    expect(second.records.map((r) => r.recordId)).toEqual(
      expect.arrayContaining([inWork.recordId, newer.recordId]),
    );
    expect(second.cursors).toEqual({ [alice.personalVaultId]: 2, [work.vaultId]: 1 });

    // Nothing new: the same cursors come back.
    const third = await sync(alice, second.cursors);
    expect(third.records).toEqual([]);
    expect(third.cursors).toEqual(second.cursors);
  });

  it("pages through the vaults in seq order and resumes from the returned cursors", async () => {
    const alice = await signUp("alice@example.com");
    const work = await createVaultFor(alice);
    // Personal: 60 versions (a create and its delete, 58 creates). Work: 45 creates.
    const a = await createRecord(alice, alice.personalVaultId);
    await push(alice, deleteChange(alice.personalVaultId, a.recordId, 1));
    await push(alice, ...Array.from({ length: 58 }, () => putChange(alice.personalVaultId)));
    await push(alice, ...Array.from({ length: 45 }, () => putChange(work.vaultId)));

    const pages: Awaited<ReturnType<typeof sync>>[] = [];
    let cursors: Record<string, number> = {};
    do {
      const page = await sync(alice, cursors, MIN_SYNC_RECORDS);
      pages.push(page);
      cursors = page.cursors;
    } while (pages.at(-1)!.hasMore);

    expect(pages.map((p) => p.records.length)).toEqual([50, 50, 5]);
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false]);
    const pulled = pages.flatMap((p) => p.records.map((r) => `${r.recordId}@${r.version}`));
    expect(new Set(pulled).size).toBe(105);
    expect(pulled).toEqual(expect.arrayContaining([`${a.recordId}@1`, `${a.recordId}@2`]));
    expect(cursors).toEqual({ [alice.personalVaultId]: 60, [work.vaultId]: 45 });

    // A vault's cursor never passes a row of it the device hasn't pulled.
    for (const [i, page] of pages.entries()) {
      const seen = pages.slice(0, i + 1).flatMap((p) => p.records);
      for (const [vaultId, cursor] of Object.entries(page.cursors)) {
        expect(seen.filter((r) => r.vaultId === vaultId)).toHaveLength(cursor);
      }
    }

    // An exactly full page already knows nothing more waits.
    const exact = await sync(
      alice,
      { [alice.personalVaultId]: 10, [work.vaultId]: 45 },
      MIN_SYNC_RECORDS,
    );
    expect(exact.records).toHaveLength(50);
    expect(exact.hasMore).toBe(false);
  });

  it("numbers each vault's writes on its own, deletes and moves included", async () => {
    const alice = await signUp("alice@example.com");
    const work = await createVaultFor(alice);
    const a = await createRecord(alice, alice.personalVaultId);
    const b = await createRecord(alice, alice.personalVaultId);
    await createRecord(alice, work.vaultId);

    await push(alice, deleteChange(alice.personalVaultId, a.recordId, 1));
    // A move: the copy in the target and the source's tombstone, in one batch.
    await push(alice, putChange(work.vaultId), deleteChange(alice.personalVaultId, b.recordId, 1));

    const rows = await db
      .select({ vaultId: recordsTable.vaultId, seq: recordsTable.seq })
      .from(recordsTable)
      .orderBy(recordsTable.seq);
    const seqsOf = (vaultId: string) => rows.filter((r) => r.vaultId === vaultId).map((r) => r.seq);
    // create, create, delete tombstone, move tombstone
    expect(seqsOf(alice.personalVaultId)).toEqual([1, 2, 3, 4]);
    // create, moved copy
    expect(seqsOf(work.vaultId)).toEqual([1, 2]);
    expect((await sync(alice)).cursors).toEqual({ [alice.personalVaultId]: 4, [work.vaultId]: 2 });
  });

  it("holds a write back until an earlier one to the vault commits, so no pull skips it", async () => {
    const alice = await signUp("alice@example.com");
    const { cursors } = await sync(alice);

    // A slow write took the vault's next seq and hasn't committed yet.
    let commitSlowWrite!: () => void;
    let seqTaken!: () => void;
    const taken = new Promise<void>((r) => (seqTaken = r));
    const slowWrite = db.transaction(async (tx) => {
      const seq = await nextVaultSeq(tx, alice.personalVaultId);
      const { recordId, encryptedData, encryptionNonce, clientChangeId } = putChange(
        alice.personalVaultId,
        { data: "SLOW" },
      );
      await tx.insert(recordsTable).values({
        recordId,
        vaultId: alice.personalVaultId,
        encryptedData,
        encryptionNonce,
        clientChangeId,
        userId: alice.userId,
        clientUpdatedAt: new Date(),
        seq,
      });
      seqTaken();
      await new Promise<void>((r) => (commitSlowWrite = r));
    });
    // A failing slow write rejects here instead of leaving `taken` pending.
    await Promise.race([taken, slowWrite]);

    // A later write to the same vault waits for it instead of committing first.
    let fastDone = false;
    const fastWrite = createRecord(alice, alice.personalVaultId, "FAST").then(() => {
      fastDone = true;
    });
    try {
      await new Promise((r) => setTimeout(r, 200));
      expect(fastDone).toBe(false);
      expect((await sync(alice, cursors)).records).toEqual([]);
    } finally {
      // Even on a failed expect: an open transaction would hang the test and hold a connection.
      commitSlowWrite();
      await slowWrite;
      await fastWrite;
    }

    const pulled = await sync(alice, cursors);
    expect(pulled.records.map((r) => r.encryptedData).sort()).toEqual(["FAST", "SLOW"]);
    expect(pulled.cursors).toEqual({ [alice.personalVaultId]: 2 });
  });

  it("ignores cursors for vaults the user isn't a member of", async () => {
    const alice = await signUp("alice@example.com");
    await createRecord(alice, alice.personalVaultId);

    const pulled = await sync(alice, { [crypto.randomUUID()]: 5 });
    expect(pulled.records).toHaveLength(1);
    expect(pulled.cursors).toEqual({ [alice.personalVaultId]: 1 });
  });
});

describe("record.push under the vault lock", () => {
  it("moves a record as one batch: the copy in the target, the source tombstoned with its history", async () => {
    const alice = await signUp("alice@example.com");
    const work = await createVaultFor(alice);
    const record = await createRecord(alice, alice.personalVaultId);

    const copy = putChange(work.vaultId, { data: "MOVED" });
    expect(
      await push(alice, copy, deleteChange(alice.personalVaultId, record.recordId, 1)),
    ).toMatchObject([
      { status: "applied", record: { recordId: copy.recordId, vaultId: work.vaultId, version: 1 } },
      { status: "applied", record: { vaultId: alice.personalVaultId, version: 2 } },
    ]);

    const history = await (
      await as(alice, "query", "record.history", record.recordId)
    ).record.history(record.recordId);
    expect(history.map((h) => [h.version, h.vaultId, h.deleted_at !== null])).toEqual([
      [2, alice.personalVaultId, true],
      [1, alice.personalVaultId, false],
    ]);
  });

  it("rejects a new record whose id is taken, even in a foreign vault", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const record = await createRecord(alice, alice.personalVaultId);

    expect(
      await push(bob, putChange(bob.personalVaultId, { recordId: record.recordId })),
    ).toMatchObject([{ status: "rejected", reason: "not_found" }]);
  });

  it("applies the changes of a vault the user may write to next to rejected ones", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");
    const work = await createVaultFor(alice);
    await addMember(alice, work, bob, "read");

    expect(
      await push(
        bob,
        putChange(work.vaultId),
        putChange(bob.personalVaultId),
        putChange(alice.personalVaultId),
      ),
    ).toMatchObject([
      { status: "rejected", reason: "forbidden" },
      { status: "applied", record: { vaultId: bob.personalVaultId } },
      { status: "rejected", reason: "not_found" },
    ]);
    expect((await sync(alice)).records).toEqual([]);
  });

  it("numbers a batch's versions per vault in batch order, with one seq run each", async () => {
    const alice = await signUp("alice@example.com");
    const work = await createVaultFor(alice);
    await createRecord(alice, alice.personalVaultId); // seq 1

    const a = putChange(alice.personalVaultId);
    const results = await push(
      alice,
      a,
      putChange(work.vaultId),
      putChange(alice.personalVaultId, { recordId: a.recordId, baseVersion: 1 }),
      putChange(work.vaultId),
    );
    expect(results.every((r) => r.status === "applied")).toBe(true);

    const rows = await db
      .select({
        vaultId: recordsTable.vaultId,
        version: recordsTable.version,
        seq: recordsTable.seq,
        recordId: recordsTable.recordId,
      })
      .from(recordsTable)
      .orderBy(recordsTable.vaultId, recordsTable.seq);
    const personal = rows.filter((r) => r.vaultId === alice.personalVaultId);
    expect(personal.map((r) => r.seq)).toEqual([1, 2, 3]);
    // A's versions take seqs in chain order.
    expect(
      personal.filter((r) => r.recordId === a.recordId).map((r) => [r.version, r.seq]),
    ).toEqual([
      [1, 2],
      [2, 3],
    ]);
    expect(rows.filter((r) => r.vaultId === work.vaultId).map((r) => r.seq)).toEqual([1, 2]);
    expect((await sync(alice)).cursors).toEqual({ [alice.personalVaultId]: 3, [work.vaultId]: 2 });
  });

  it("two pushes racing for the same next version: one applies, the other is stale", async () => {
    const alice = await signUp("alice@example.com");
    const record = await createRecord(alice, alice.personalVaultId);

    const edit = (data: string) =>
      putChange(alice.personalVaultId, { recordId: record.recordId, baseVersion: 1, data });
    const results = await Promise.all([push(alice, edit("A")), push(alice, edit("B"))]);

    expect(results.map(([r]) => r?.status).sort()).toEqual(["applied", "stale"]);
    expect(results.flat().find((r) => r.status === "stale")).toMatchObject({ headVersion: 2 });
  });

  it("answers SERVICE_UNAVAILABLE instead of hanging when a vault stays locked", async () => {
    const alice = await signUp("alice@example.com");

    let release!: () => void;
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const stuck = db.transaction(async (tx) => {
      await lockVaults(tx, [alice.personalVaultId]);
      locked();
      await new Promise<void>((r) => (release = r));
    });
    await Promise.race([isLocked, stuck]);

    try {
      await expect(push(alice, putChange(alice.personalVaultId))).rejects.toMatchObject({
        code: "SERVICE_UNAVAILABLE",
      });
    } finally {
      release();
      await stuck;
    }
    // Nothing was written; the vault takes writes again.
    expect(await push(alice, putChange(alice.personalVaultId))).toMatchObject([
      { status: "applied", record: { version: 1 } },
    ]);
    expect((await sync(alice)).cursors).toEqual({ [alice.personalVaultId]: 1 });
  });
});
