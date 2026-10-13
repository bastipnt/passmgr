import { db, vaultsTable } from "@repo/db";
import { type PushChange, pushChangeBytes } from "@repo/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { onRecordsChanged } from "../../src/events/record-events";
import { STORAGE_QUOTA_BYTES } from "../../src/record/quota";
import { redis } from "../../src/redis";
import { truncateAll } from "../setup/db-helpers";
import { callSigned, deleteChange, loginAndGetAuthKey, putChange, register } from "./_helpers";

type Session = Awaited<ReturnType<typeof loginAndGetAuthKey>>;

async function push(session: Session, ...changes: PushChange[]) {
  const input = { changes };
  const caller = await callSigned(
    session.sessionId,
    session.authKey,
    "mutation",
    "record.push",
    input,
  );
  return (await caller.record.push(input)).results;
}

async function history(session: Session, recordId: string) {
  const caller = await callSigned(
    session.sessionId,
    session.authKey,
    "query",
    "record.history",
    recordId,
  );
  return await caller.record.history(recordId);
}

async function signUp(email: string) {
  await register(email, "pw");
  const session = await loginAndGetAuthKey(email, "pw");
  return { ...session, vaultId: session.vaultKeys[0]!.vaultId };
}

beforeEach(async () => {
  await truncateAll();
  await redis.flushall();
});

describe("record.push", () => {
  it("creates a record and appends versions on top of the head", async () => {
    const alice = await signUp("alice@example.com");
    const create = putChange(alice.vaultId);
    const [created] = await push(alice, create);
    expect(created).toMatchObject({
      clientChangeId: create.clientChangeId,
      status: "applied",
      record: { recordId: create.recordId, version: 1, encryptedData: "ENC", deleted_at: null },
    });

    const update = putChange(alice.vaultId, {
      recordId: create.recordId,
      baseVersion: 1,
      data: "ENC-V2",
    });
    expect(await push(alice, update)).toMatchObject([
      { status: "applied", record: { version: 2, encryptedData: "ENC-V2" } },
    ]);
    expect((await history(alice, create.recordId)).map((r) => r.version)).toEqual([2, 1]);
  });

  it("answers a retried change with the stored version instead of appending again", async () => {
    const alice = await signUp("alice@example.com");
    const create = putChange(alice.vaultId);
    const update = putChange(alice.vaultId, { recordId: create.recordId, baseVersion: 1 });
    const first = await push(alice, create, update);

    // The response got lost: the client sends the same changes again.
    expect(await push(alice, create, update)).toEqual(first);
    expect(await history(alice, create.recordId)).toHaveLength(2);
  });

  it("answers a change built on an old version as stale, and applies the rest of the batch", async () => {
    const alice = await signUp("alice@example.com");
    const record = putChange(alice.vaultId);
    await push(alice, record);
    await push(alice, putChange(alice.vaultId, { recordId: record.recordId, baseVersion: 1 }));

    const stale = putChange(alice.vaultId, { recordId: record.recordId, baseVersion: 1 });
    const other = putChange(alice.vaultId);
    expect(await push(alice, stale, other)).toMatchObject([
      { clientChangeId: stale.clientChangeId, status: "stale", headVersion: 2 },
      { clientChangeId: other.clientChangeId, status: "applied" },
    ]);
    expect(await history(alice, record.recordId)).toHaveLength(2);
  });

  it("applies a record's chain all or nothing", async () => {
    const alice = await signUp("alice@example.com");
    const record = putChange(alice.vaultId);
    await push(alice, record);

    // The second link doesn't build on the first: neither is written.
    const losing = putChange(alice.vaultId, { recordId: record.recordId, baseVersion: 1 });
    const broken = putChange(alice.vaultId, { recordId: record.recordId, baseVersion: 1 });
    expect(await push(alice, losing, broken)).toMatchObject([
      { status: "stale", headVersion: 1 },
      { status: "stale", headVersion: 1 },
    ]);
    expect(await history(alice, record.recordId)).toHaveLength(1);

    // A losing edit with the merge on top goes in together.
    const merged = putChange(alice.vaultId, { recordId: record.recordId, baseVersion: 2 });
    expect(await push(alice, losing, merged)).toMatchObject([
      { status: "applied", record: { version: 2 } },
      { status: "applied", record: { version: 3 } },
    ]);
  });

  it("tombstones a record with its last ciphertext, and an edit restores it", async () => {
    const alice = await signUp("alice@example.com");
    const record = putChange(alice.vaultId, { data: "LAST" });
    await push(alice, record);

    expect(await push(alice, deleteChange(alice.vaultId, record.recordId, 1))).toMatchObject([
      {
        status: "applied",
        record: { version: 2, encryptedData: "LAST", deleted_at: expect.any(String) },
      },
    ]);

    // Deleted on another device too: one more tombstone, so the numbering stays
    // the client's and a chain can go on from it (here: restored right away).
    const again = deleteChange(alice.vaultId, record.recordId, 2);
    const restore = putChange(alice.vaultId, {
      recordId: record.recordId,
      baseVersion: 3,
      data: "BACK",
    });
    expect(await push(alice, again, restore)).toMatchObject([
      {
        status: "applied",
        record: { version: 3, encryptedData: "LAST", deleted_at: expect.any(String) },
      },
      { status: "applied", record: { version: 4, encryptedData: "BACK", deleted_at: null } },
    ]);
  });

  it("purges a record: drops its history and keeps one tombstone without content", async () => {
    const alice = await signUp("alice@example.com");
    const record = putChange(alice.vaultId, { data: "SECRET" });
    await push(alice, record);
    await push(alice, deleteChange(alice.vaultId, record.recordId, 1));

    const purge = {
      ...deleteChange(alice.vaultId, record.recordId, 2),
      tombstoneKind: "purged" as const,
    };
    expect(await push(alice, purge)).toMatchObject([
      {
        status: "applied",
        record: {
          version: 3,
          encryptedData: "",
          tombstoneKind: "purged",
          deleted_at: expect.any(String),
        },
      },
    ]);
    const left = await history(alice, record.recordId);
    expect(left).toMatchObject([{ version: 3, encryptedData: "", tombstoneKind: "purged" }]);

    // A delete on top stays purged; an edit starts the record over.
    const again = deleteChange(alice.vaultId, record.recordId, 3);
    const restore = putChange(alice.vaultId, {
      recordId: record.recordId,
      baseVersion: 4,
      data: "NEW",
    });
    expect(await push(alice, again, restore)).toMatchObject([
      { status: "applied", record: { version: 4, encryptedData: "", tombstoneKind: "purged" } },
      { status: "applied", record: { version: 5, encryptedData: "NEW", tombstoneKind: null } },
    ]);
  });

  it("counts what a vault stores against its owner's quota: puts past it are rejected, deletes and purges apply", async () => {
    const alice = await signUp("alice@example.com");
    const usedBytes = async () =>
      (
        await db
          .select({ usedBytes: vaultsTable.usedBytes })
          .from(vaultsTable)
          .where(eq(vaultsTable.vaultId, alice.vaultId))
      )[0]!.usedBytes;
    const record = putChange(alice.vaultId, { data: "SECRET" });
    await push(alice, record);
    await push(alice, deleteChange(alice.vaultId, record.recordId, 1));
    expect(await usedBytes()).toBe(2 * pushChangeBytes({ encryptedData: "SECRET" }));

    await db
      .update(vaultsTable)
      .set({ usedBytes: STORAGE_QUOTA_BYTES - 100 })
      .where(eq(vaultsTable.vaultId, alice.vaultId));
    const blocked = putChange(alice.vaultId);
    expect(await push(alice, blocked)).toMatchObject([{ status: "rejected", reason: "quota" }]);

    const purge = {
      ...deleteChange(alice.vaultId, record.recordId, 2),
      tombstoneKind: "purged" as const,
    };
    expect(await push(alice, purge)).toMatchObject([{ status: "applied" }]);
    expect(await usedBytes()).toBe(
      STORAGE_QUOTA_BYTES -
        100 -
        2 * pushChangeBytes({ encryptedData: "SECRET" }) +
        pushChangeBytes({ encryptedData: "" }),
    );
    expect(await push(alice, blocked)).toMatchObject([{ status: "applied" }]);
  });

  describe("storage quota", () => {
    async function fillQuota(vaultId: string, free = 100) {
      await db
        .update(vaultsTable)
        .set({ usedBytes: STORAGE_QUOTA_BYTES - free })
        .where(eq(vaultsTable.vaultId, vaultId));
    }

    it("rejects a move's source tombstone with its target over quota, so the record stays", async () => {
      const alice = await signUp("alice@example.com");
      const source = putChange(alice.vaultId);
      await push(alice, source);
      await fillQuota(alice.vaultId);

      const target = putChange(alice.vaultId, { data: "MOVED" });
      const moved = {
        ...deleteChange(alice.vaultId, source.recordId, 1),
        tombstoneKind: "moved" as const,
      };
      expect(await push(alice, target, moved)).toMatchObject([
        { status: "rejected", reason: "quota" },
        { status: "rejected", reason: "quota" },
      ]);
      expect(await history(alice, source.recordId)).toHaveLength(1);
    });

    it("lets a rotation rewrite a record still under the old key, however full", async () => {
      const alice = await signUp("alice@example.com");
      const record = putChange(alice.vaultId);
      await push(alice, record);
      await fillQuota(alice.vaultId);
      await db
        .update(vaultsTable)
        .set({ keyVersion: 2 })
        .where(eq(vaultsTable.vaultId, alice.vaultId));

      const rewrite = putChange(alice.vaultId, {
        recordId: record.recordId,
        baseVersion: 1,
        keyVersion: 2,
      });
      expect(await push(alice, rewrite)).toMatchObject([{ status: "applied" }]);
      const edit = putChange(alice.vaultId, {
        recordId: record.recordId,
        baseVersion: 2,
        keyVersion: 2,
      });
      expect(await push(alice, edit)).toMatchObject([{ status: "rejected", reason: "quota" }]);
    });

    it("doesn't count a deleted vault", async () => {
      const alice = await signUp("alice@example.com");
      const [{ ownerId }] = await db
        .select({ ownerId: vaultsTable.ownerId })
        .from(vaultsTable)
        .where(eq(vaultsTable.vaultId, alice.vaultId));
      await db.insert(vaultsTable).values({
        vaultId: crypto.randomUUID(),
        ownerId,
        kind: "shared",
        encryptedMeta: "META",
        metaEncryptionNonce: "NONCE",
        usedBytes: STORAGE_QUOTA_BYTES,
        deleted_at: new Date(),
      });
      expect(await push(alice, putChange(alice.vaultId))).toMatchObject([{ status: "applied" }]);
    });
  });

  it("marks the source of a move, keeping its content", async () => {
    const alice = await signUp("alice@example.com");
    const record = putChange(alice.vaultId, { data: "LAST" });
    await push(alice, record);
    const moved = {
      ...deleteChange(alice.vaultId, record.recordId, 1),
      tombstoneKind: "moved" as const,
    };
    expect(await push(alice, moved)).toMatchObject([
      { status: "applied", record: { version: 2, encryptedData: "LAST", tombstoneKind: "moved" } },
    ]);
    expect(await history(alice, record.recordId)).toHaveLength(2);
  });

  it("answers a delete that missed an edit as stale", async () => {
    const alice = await signUp("alice@example.com");
    const record = putChange(alice.vaultId);
    await push(alice, record);
    await push(alice, putChange(alice.vaultId, { recordId: record.recordId, baseVersion: 1 }));

    expect(await push(alice, deleteChange(alice.vaultId, record.recordId, 1))).toMatchObject([
      { status: "stale", headVersion: 2 },
    ]);
  });

  it("refuses a batch that carries the same change twice", async () => {
    const alice = await signUp("alice@example.com");
    const create = putChange(alice.vaultId);
    await expect(push(alice, create, { ...create, baseVersion: 1 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(await push(alice, create)).toMatchObject([{ status: "applied" }]);
  });

  it("rejects a version of a record the server doesn't have", async () => {
    const alice = await signUp("alice@example.com");
    const results = await push(
      alice,
      putChange(alice.vaultId, { baseVersion: 3 }),
      deleteChange(alice.vaultId, crypto.randomUUID(), 1),
    );
    expect(results).toMatchObject([
      { status: "rejected", reason: "not_found" },
      { status: "rejected", reason: "not_found" },
    ]);
  });

  it("pings the sync stream once per batch", async () => {
    const alice = await signUp("alice@example.com");
    let pings = 0;
    const stop = onRecordsChanged(await ownerOf(alice), () => pings++);
    try {
      await push(
        alice,
        putChange(alice.vaultId),
        putChange(alice.vaultId),
        putChange(alice.vaultId),
      );
    } finally {
      stop();
    }
    expect(pings).toBe(1);
  });
});

describe("record.push — cross-user isolation", () => {
  it("never writes to, or hands out, another user's record", async () => {
    const alice = await signUp("a@example.com");
    const bob = await signUp("b@example.com");
    const record = putChange(alice.vaultId);
    await push(alice, record);

    // Into Alice's vault, or onto her record id from Bob's own vault.
    const intoHers = putChange(alice.vaultId, { recordId: record.recordId, baseVersion: 1 });
    const fromMine = putChange(bob.vaultId, { recordId: record.recordId, baseVersion: 1 });
    // A replay of her change id: must not return her stored version.
    const replay = { ...record, vaultId: bob.vaultId };
    expect(await push(bob, intoHers, fromMine, replay)).toMatchObject([
      { status: "rejected", reason: "not_found" },
      { status: "rejected", reason: "not_found" },
      { status: "rejected", reason: "not_found" },
    ]);
    expect(await history(alice, record.recordId)).toHaveLength(1);
  });
});

/** The user id behind a session, from their personal vault. */
async function ownerOf(session: { vaultId: string }) {
  const [vault] = await db
    .select({ ownerId: vaultsTable.ownerId })
    .from(vaultsTable)
    .where(eq(vaultsTable.vaultId, session.vaultId));
  return vault!.ownerId;
}
