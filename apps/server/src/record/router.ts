import { db, type RecordType, recordsTable } from "@repo/db";
import {
  createRecordInputSchema,
  deleteRecordInputSchema,
  encryptedRecordSchema,
  moveRecordInputSchema,
  syncInputSchema,
  syncOutputSchema,
  updateRecordInputSchema,
  VAULT_WRITE_ROLES,
  vaultRoleSchema,
} from "@repo/schema";
import { TRPCError, tracked } from "@trpc/server";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import z from "zod";
import { protectedProcedure, protectedSubscriptionProcedure } from "../auth/auth-middleware";
import { onRecordsChanged } from "../events/record-events";
import { router } from "../trpc";
import { isUniqueViolation } from "../util/general";
import {
  type DbExecutor,
  memberVaults,
  notifyVaultMembers,
  requireVaultRole,
} from "../vault/access";

const ANY_ROLE = vaultRoleSchema.options;

function serializeRecord(record: RecordType) {
  const {
    rowId: _rowId,
    userId: _userId,
    clientUpdatedAt,
    created_at,
    updated_at,
    deleted_at,
    ...rest
  } = record;

  return {
    ...rest,
    clientUpdatedAt: clientUpdatedAt.toISOString(),
    created_at: created_at?.toISOString() ?? null,
    updated_at: updated_at.toISOString(),
    deleted_at: deleted_at?.toISOString() ?? null,
  };
}

/**
 * The latest version of a record (deleted or not) the user may access with one
 * of `roles`. NOT_FOUND for a record that doesn't exist or lives in a vault the
 * user isn't a member of, so ids from other vaults can't be probed.
 */
async function latestAccessibleVersion(
  userId: string,
  recordId: string,
  roles: Parameters<typeof requireVaultRole>[2],
  tx: DbExecutor = db,
): Promise<RecordType> {
  const [latest] = await tx
    .select()
    .from(recordsTable)
    .where(eq(recordsTable.recordId, recordId))
    .orderBy(desc(recordsTable.version))
    .limit(1);
  if (!latest) throw new TRPCError({ code: "NOT_FOUND" });

  await requireVaultRole(userId, latest.vaultId, roles, tx);
  return latest;
}

/**
 * Run a write transaction, answering a `(recordId, version)` that already exists
 * with CONFLICT instead of a 500: a client-chosen id that is taken, or two
 * writes racing for the same next version.
 */
async function writeRecords<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(fn);
  } catch (error) {
    if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT" });
    throw error;
  }
}

export const recordRouter = router({
  sync: protectedProcedure
    .input(syncInputSchema)
    .output(syncOutputSchema)
    .query(async ({ ctx, input }) => {
      const serverTimestamp = new Date().toISOString();
      const vaults = await memberVaults(ctx.userId);
      if (vaults.length === 0) return { records: [], vaults, serverTimestamp };

      // Each vault from its own cursor; one this device hasn't synced yet in full.
      const perVault = vaults.map(({ vaultId }) => {
        const cursor = input.cursors[vaultId];
        return cursor
          ? and(eq(recordsTable.vaultId, vaultId), gt(recordsTable.updated_at, new Date(cursor)))
          : eq(recordsTable.vaultId, vaultId);
      });

      const records = await db
        .select()
        .from(recordsTable)
        .where(or(...perVault))
        .orderBy(recordsTable.recordId, desc(recordsTable.version));

      return { records: records.map(serializeRecord), vaults, serverTimestamp };
    }),

  all: protectedProcedure
    .output(z.object({ records: z.array(encryptedRecordSchema) }))
    .query(async ({ ctx }) => {
      const vaultIds = (await memberVaults(ctx.userId)).map((v) => v.vaultId);
      if (vaultIds.length === 0) return { records: [] };

      // DISTINCT ON gets the latest version (highest) per recordId, then filter out deleted
      const latestPerRecord = db
        .selectDistinctOn([recordsTable.recordId])
        .from(recordsTable)
        .where(inArray(recordsTable.vaultId, vaultIds))
        .orderBy(recordsTable.recordId, desc(recordsTable.version))
        .as("latest_per_record");

      const records = await db
        .select()
        .from(latestPerRecord)
        .where(isNull(latestPerRecord.deleted_at));

      return { records: records.map(serializeRecord) };
    }),

  getById: protectedProcedure
    .input(z.uuid())
    .output(encryptedRecordSchema)
    .query(async ({ ctx, input }) => {
      const record = await latestAccessibleVersion(ctx.userId, input, ANY_ROLE);
      if (record.deleted_at) throw new TRPCError({ code: "NOT_FOUND" });
      return serializeRecord(record);
    }),

  history: protectedProcedure
    .input(z.uuid())
    .output(z.array(encryptedRecordSchema))
    .query(async ({ ctx, input }) => {
      await latestAccessibleVersion(ctx.userId, input, ANY_ROLE);
      const records = await db
        .select()
        .from(recordsTable)
        .where(eq(recordsTable.recordId, input))
        .orderBy(desc(recordsTable.version));
      return records.map(serializeRecord);
    }),

  create: protectedProcedure
    .input(createRecordInputSchema)
    .output(encryptedRecordSchema)
    .mutation(async ({ ctx, input }) => {
      const record = await writeRecords(async (tx) => {
        await requireVaultRole(ctx.userId, input.vaultId, VAULT_WRITE_ROLES, tx);
        const [created] = await tx
          .insert(recordsTable)
          .values({
            ...input,
            userId: ctx.userId,
            clientUpdatedAt: new Date(input.clientUpdatedAt),
            version: 1,
          })
          .returning();
        return created;
      });
      if (!record) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await notifyVaultMembers(record.vaultId);
      return serializeRecord(record);
    }),

  update: protectedProcedure
    .input(updateRecordInputSchema)
    .output(encryptedRecordSchema)
    .mutation(async ({ ctx, input }) => {
      const { recordId, version, clientUpdatedAt, ...data } = input;

      const record = await writeRecords(async (tx) => {
        // A deleted head is updated too: the edit restores the record (an edit
        // beats a delete, ADR 0001 D5), e.g. one edited offline on another device.
        const current = await latestAccessibleVersion(ctx.userId, recordId, VAULT_WRITE_ROLES, tx);
        // TODO: make this not a conflict
        if (current.version !== version) throw new TRPCError({ code: "CONFLICT" });

        const [updated] = await tx
          .insert(recordsTable)
          .values({
            recordId,
            vaultId: current.vaultId,
            userId: ctx.userId,
            ...data,
            version: version + 1,
            clientUpdatedAt: new Date(clientUpdatedAt),
          })
          .returning();
        return updated;
      });
      if (!record) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await notifyVaultMembers(record.vaultId);
      return serializeRecord(record);
    }),

  /**
   * Tombstone a record. With `version` it is compare-and-swap like `update`:
   * CONFLICT when the head moved on, so an edit made meanwhile isn't deleted
   * unseen (the client merges, and an edit beats a delete, ADR 0001 D5).
   */
  delete: protectedProcedure.input(deleteRecordInputSchema).mutation(async ({ ctx, input }) => {
    const { recordId, version } = typeof input === "string" ? { recordId: input } : input;
    const vaultId = await writeRecords(async (tx) => {
      const current = await latestAccessibleVersion(ctx.userId, recordId, VAULT_WRITE_ROLES, tx);
      if (current.deleted_at !== null) throw new TRPCError({ code: "NOT_FOUND" });
      if (version !== undefined && current.version !== version) {
        throw new TRPCError({ code: "CONFLICT" });
      }
      await tx.insert(recordsTable).values(tombstoneOf(current, ctx.userId));
      return current.vaultId;
    });

    await notifyVaultMembers(vaultId);
  }),

  /**
   * Move a record to another vault (ADR 0001 D6): the re-encrypted copy becomes
   * a new record in the target, the source is tombstoned and keeps its history,
   * which must not leak to the target vault's members.
   */
  move: protectedProcedure
    .input(moveRecordInputSchema)
    .output(encryptedRecordSchema)
    .mutation(async ({ ctx, input }) => {
      const { recordId, version, target } = input;

      const { moved, sourceVaultId } = await writeRecords(async (tx) => {
        const source = await latestAccessibleVersion(ctx.userId, recordId, VAULT_WRITE_ROLES, tx);
        if (source.deleted_at !== null) throw new TRPCError({ code: "NOT_FOUND" });
        if (source.version !== version) throw new TRPCError({ code: "CONFLICT" });
        if (source.vaultId === target.vaultId || target.recordId === recordId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "not a move" });
        }
        await requireVaultRole(ctx.userId, target.vaultId, VAULT_WRITE_ROLES, tx);

        const [created] = await tx
          .insert(recordsTable)
          .values({
            ...target,
            userId: ctx.userId,
            clientUpdatedAt: new Date(target.clientUpdatedAt),
            version: 1,
          })
          .returning();
        await tx.insert(recordsTable).values(tombstoneOf(source, ctx.userId));
        return { moved: created, sourceVaultId: source.vaultId };
      });
      if (!moved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await notifyVaultMembers(sourceVaultId);
      await notifyVaultMembers(moved.vaultId);
      return serializeRecord(moved);
    }),

  onRecordChange: protectedSubscriptionProcedure.subscription(async function* ({ ctx, signal }) {
    yield tracked("connected", { type: "connected" as const });

    let resolve: (() => void) | null = null;
    const unsubscribe = onRecordsChanged(ctx.userId, () => {
      if (resolve) {
        const r = resolve;
        resolve = null;
        r();
      }
    });

    try {
      while (!signal?.aborted) {
        await new Promise<void>((r) => {
          resolve = r;
          signal?.addEventListener("abort", () => r(), { once: true });
        });
        if (!signal?.aborted) {
          yield tracked(Date.now().toString(), { type: "changed" as const });
        }
      }
    } finally {
      unsubscribe();
    }
  }),
});

/** The next version of `current`, marked deleted (same ciphertext, so history still opens). */
function tombstoneOf(current: RecordType, userId: string) {
  return {
    recordId: current.recordId,
    vaultId: current.vaultId,
    userId,
    encryptedData: current.encryptedData,
    encryptionNonce: current.encryptionNonce,
    cryptoVersion: current.cryptoVersion,
    clientUpdatedAt: current.clientUpdatedAt,
    version: current.version + 1,
    deleted_at: new Date(),
  };
}
