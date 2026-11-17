import { db, recordsTable, vaultsTable } from "@repo/db";
import {
  MAX_PURGE_SEAL_LENGTH,
  type PushChange,
  pushChangeBytes,
  RECORD_CRYPTO_VERSION,
} from "@repo/schema";
import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { onRecordsChanged } from "../../src/events/record-events";
import { DELETE_HEADROOM_BYTES, STORAGE_QUOTA_BYTES } from "../../src/record/quota";
import { serializeRecord } from "../../src/record/serialize";
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

/** Every stored version of a record, newest first, as the server would send it. */
async function history(recordId: string) {
  const rows = await db
    .select()
    .from(recordsTable)
    .where(eq(recordsTable.recordId, recordId))
    .orderBy(desc(recordsTable.version));
  return rows.map(serializeRecord);
}

async function usedBytes(vaultId: string) {
  const [vault] = await db
    .select({ usedBytes: vaultsTable.usedBytes })
    .from(vaultsTable)
    .where(eq(vaultsTable.vaultId, vaultId));
  return vault!.usedBytes;
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
    expect((await history(create.recordId)).map((r) => r.version)).toEqual([2, 1]);
  });

  it("answers a retried change with the stored version instead of appending again", async () => {
    const alice = await signUp("alice@example.com");
    const create = putChange(alice.vaultId);
    const update = putChange(alice.vaultId, { recordId: create.recordId, baseVersion: 1 });
    const first = await push(alice, create, update);

    // The response got lost: the client sends the same changes again.
    expect(await push(alice, create, update)).toEqual(first);
    expect(await history(create.recordId)).toHaveLength(2);
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
    expect(await history(record.recordId)).toHaveLength(2);
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
    expect(await history(record.recordId)).toHaveLength(1);

    // A losing edit with the merge on top goes in together.
    const merged = putChange(alice.vaultId, { recordId: record.recordId, baseVersion: 2 });
    expect(await push(alice, losing, merged)).toMatchObject([
      { status: "applied", record: { version: 2 } },
      { status: "applied", record: { version: 3 } },
    ]);
  });

  it("tombstones a record with the content it brings, and an edit restores it", async () => {
    const alice = await signUp("alice@example.com");
    const record = putChange(alice.vaultId, { data: "LAST" });
    await push(alice, record);

    const [deleted] = await push(
      alice,
      deleteChange(alice.vaultId, record.recordId, 1, { data: "TOMB" }),
    );
    expect(deleted).toMatchObject({
      status: "applied",
      record: { version: 2, encryptedData: "TOMB", deleted_at: expect.any(String) },
    });
    expect(await history(record.recordId)).toMatchObject([
      { version: 2, encryptedData: "TOMB" },
      { version: 1, encryptedData: "LAST" },
    ]);

    const restore = putChange(alice.vaultId, {
      recordId: record.recordId,
      baseVersion: 2,
      data: "BACK",
    });
    expect(await push(alice, restore)).toMatchObject([
      { status: "applied", record: { version: 3, encryptedData: "BACK", deleted_at: null } },
    ]);
  });

  it("purges a record: drops its history and keeps one tombstone with its seal", async () => {
    const alice = await signUp("alice@example.com");
    const record = putChange(alice.vaultId, { data: "SECRET" });
    await push(alice, record);
    await push(alice, deleteChange(alice.vaultId, record.recordId, 1));

    const purge = {
      ...deleteChange(alice.vaultId, record.recordId, 2, { data: "TAG" }),
      tombstoneKind: "purged" as const,
    };
    expect(await push(alice, purge)).toMatchObject([
      {
        status: "applied",
        record: {
          version: 3,
          encryptedData: "TAG",
          tombstoneKind: "purged",
          deleted_at: expect.any(String),
        },
      },
    ]);
    expect(await history(record.recordId)).toMatchObject([
      { version: 3, encryptedData: "TAG", tombstoneKind: "purged" },
    ]);

    // An edit starts the record over.
    const restore = putChange(alice.vaultId, {
      recordId: record.recordId,
      baseVersion: 3,
      data: "NEW",
    });
    expect(await push(alice, restore)).toMatchObject([
      { status: "applied", record: { version: 4, encryptedData: "NEW", tombstoneKind: null } },
    ]);
  });

  describe("deletes bring their sealed ciphertext (ADR 0001 D11)", () => {
    const seal = (data: string) => ({
      encryptedData: data,
      encryptionNonce: "N",
      cryptoVersion: RECORD_CRYPTO_VERSION,
      keyVersion: 1,
    });

    it("appends a tombstone even on one of its kind, each byte counted against the quota", async () => {
      const alice = await signUp("alice@example.com");
      const record = putChange(alice.vaultId, { data: "SECRET" });
      await push(alice, record);

      const del = { ...deleteChange(alice.vaultId, record.recordId, 1), ...seal("TOMB-2") };
      const again = { ...deleteChange(alice.vaultId, record.recordId, 2), ...seal("TOMB-3") };
      expect(await push(alice, del, again)).toMatchObject([
        { status: "applied", record: { version: 2, encryptedData: "TOMB-2", cryptoVersion: 1 } },
        { status: "applied", record: { version: 3, encryptedData: "TOMB-3", tombstoneKind: null } },
      ]);
      expect(await usedBytes(alice.vaultId)).toBe(
        ["SECRET", "TOMB-2", "TOMB-3"].reduce(
          (sum, data) => sum + pushChangeBytes({ encryptedData: data }),
          0,
        ),
      );
    });

    it("takes the kind its ciphertext is sealed for, not the head's", async () => {
      const alice = await signUp("alice@example.com");
      const record = putChange(alice.vaultId);
      await push(alice, record);
      await push(alice, {
        ...deleteChange(alice.vaultId, record.recordId, 1),
        tombstoneKind: "moved" as const,
      });

      const del = { ...deleteChange(alice.vaultId, record.recordId, 2), ...seal("TOMB") };
      expect(await push(alice, del)).toMatchObject([
        { status: "applied", record: { version: 3, tombstoneKind: null } },
      ]);
    });

    it("rejects a delete under a key the vault doesn't use", async () => {
      const alice = await signUp("alice@example.com");
      const record = putChange(alice.vaultId);
      await push(alice, record);

      const del = {
        ...deleteChange(alice.vaultId, record.recordId, 1),
        ...seal("TOMB"),
        keyVersion: 2,
      };
      expect(await push(alice, del)).toMatchObject([{ status: "rejected", reason: "key_version" }]);
    });

    it("refuses a purge with content, and a delete with part of a ciphertext or unsealed", async () => {
      const alice = await signUp("alice@example.com");
      const record = putChange(alice.vaultId);
      await push(alice, record);
      const base = deleteChange(alice.vaultId, record.recordId, 1);

      await expect(
        push(alice, {
          ...base,
          tombstoneKind: "purged" as const,
          ...seal("X".repeat(MAX_PURGE_SEAL_LENGTH + 1)),
        }),
      ).rejects.toThrow();
      const { encryptionNonce: _nonce, ...partial } = base;
      await expect(push(alice, partial as PushChange)).rejects.toThrow();
      await expect(push(alice, { ...base, cryptoVersion: 2 } as PushChange)).rejects.toThrow();
    });
  });

  it("counts what a vault stores against its owner's quota: puts past it are rejected, deletes and purges apply", async () => {
    const alice = await signUp("alice@example.com");
    const record = putChange(alice.vaultId, { data: "SECRET" });
    await push(alice, record);
    await push(alice, deleteChange(alice.vaultId, record.recordId, 1));
    const stored =
      pushChangeBytes({ encryptedData: "SECRET" }) + pushChangeBytes({ encryptedData: "TOMB" });
    expect(await usedBytes(alice.vaultId)).toBe(stored);

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
    expect(await usedBytes(alice.vaultId)).toBe(
      STORAGE_QUOTA_BYTES - 100 - stored + pushChangeBytes({ encryptedData: "TOMB" }),
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
      expect(await history(source.recordId)).toHaveLength(1);
    });

    it("lets deletes go past it by a headroom only, and purges always", async () => {
      const alice = await signUp("alice@example.com");
      const records = [putChange(alice.vaultId), putChange(alice.vaultId)];
      await push(alice, ...records);
      const [first, second] = records.map((r) => deleteChange(alice.vaultId, r.recordId, 1));
      await fillQuota(alice.vaultId, 0);
      expect(await push(alice, first!)).toMatchObject([{ status: "applied" }]);

      await fillQuota(alice.vaultId, -DELETE_HEADROOM_BYTES);
      expect(await push(alice, second!)).toMatchObject([{ status: "rejected", reason: "quota" }]);
      const purge = {
        ...deleteChange(alice.vaultId, records[1]!.recordId, 1),
        tombstoneKind: "purged" as const,
      };
      expect(await push(alice, purge)).toMatchObject([{ status: "applied" }]);

      const third = putChange(alice.vaultId, { data: "Y".repeat(1000) });
      await fillQuota(alice.vaultId, 10_000);
      await push(alice, third);
      await fillQuota(alice.vaultId, -DELETE_HEADROOM_BYTES);
      const trashThenPurge = [
        deleteChange(alice.vaultId, third.recordId, 1),
        { ...deleteChange(alice.vaultId, third.recordId, 2), tombstoneKind: "purged" as const },
      ];
      expect(await push(alice, ...trashThenPurge)).toMatchObject([
        { status: "applied" },
        { status: "applied" },
      ]);
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
  });

  it("marks the source of a move, keeping its content", async () => {
    const alice = await signUp("alice@example.com");
    const record = putChange(alice.vaultId, { data: "LAST" });
    await push(alice, record);
    const moved = {
      ...deleteChange(alice.vaultId, record.recordId, 1, { data: "LAST" }),
      tombstoneKind: "moved" as const,
    };
    expect(await push(alice, moved)).toMatchObject([
      { status: "applied", record: { version: 2, tombstoneKind: "moved" } },
    ]);
    expect(await history(record.recordId)).toMatchObject([
      { version: 2, encryptedData: "LAST", tombstoneKind: "moved" },
      { version: 1 },
    ]);
  });

  it("answers a retried chain as stale when another device wrote above its stored part", async () => {
    const alice = await signUp("alice@example.com");
    const record = putChange(alice.vaultId);
    await push(alice, record);
    const deleted = deleteChange(alice.vaultId, record.recordId, 1);
    await push(alice, deleted);
    await push(alice, putChange(alice.vaultId, { recordId: record.recordId, baseVersion: 2 }));

    const edit = putChange(alice.vaultId, { recordId: record.recordId, baseVersion: 2 });
    expect(await push(alice, deleted, edit)).toMatchObject([
      { status: "applied", record: { version: 2 } },
      { status: "stale", headVersion: 3 },
    ]);
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
    expect(await history(record.recordId)).toHaveLength(1);
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
