import { router } from "../trpc";
import z from "zod";
import { protectedProcedure, protectedSubscriptionProcedure } from "../auth/auth-middleware";
import {
  createRecordInputSchema,
  updateRecordInputSchema,
  encryptedRecordSchema,
  syncInputSchema,
  syncOutputSchema,
} from "@repo/schema";
import { db, type RecordType, recordsTable } from "@repo/db";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { TRPCError, tracked } from "@trpc/server";
import { emitRecordsChanged, onRecordsChanged } from "../events/record-events";

function serializeRecord(record: RecordType) {
  const { rowId: _rowId, userId: _userId, ...rest } = record;
  return {
    ...rest,
    clientUpdatedAt: record.clientUpdatedAt.toISOString(),
    created_at: record.created_at?.toISOString() ?? null,
    updated_at: record.updated_at.toISOString(),
    deleted_at: record.deleted_at?.toISOString() ?? null,
  };
}

export const recordRouter = router({
  sync: protectedProcedure
    .input(syncInputSchema)
    .output(syncOutputSchema)
    .query(async ({ ctx, input }) => {
      const serverTimestamp = new Date().toISOString();

      const conditions = [eq(recordsTable.userId, ctx.userId)];
      if (input.lastSyncedAt) {
        conditions.push(gt(recordsTable.updated_at, new Date(input.lastSyncedAt)));
      }

      const records = await db
        .select()
        .from(recordsTable)
        .where(and(...conditions))
        .orderBy(recordsTable.recordId, desc(recordsTable.version));

      return { records: records.map(serializeRecord), serverTimestamp };
    }),

  all: protectedProcedure
    .output(z.object({ records: z.array(encryptedRecordSchema) }))
    .query(async ({ ctx }) => {
      // DISTINCT ON gets the latest version (highest) per recordId, then filter out deleted
      const latestPerRecord = db
        .selectDistinctOn([recordsTable.recordId])
        .from(recordsTable)
        .where(eq(recordsTable.userId, ctx.userId))
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
      const latestForRecord = db
        .selectDistinctOn([recordsTable.recordId])
        .from(recordsTable)
        .where(and(eq(recordsTable.recordId, input), eq(recordsTable.userId, ctx.userId)))
        .orderBy(recordsTable.recordId, desc(recordsTable.version))
        .as("latest_for_record");

      const [record] = await db
        .select()
        .from(latestForRecord)
        .where(isNull(latestForRecord.deleted_at));

      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      return serializeRecord(record);
    }),

  history: protectedProcedure
    .input(z.uuid())
    .output(z.array(encryptedRecordSchema))
    .query(async ({ ctx, input }) => {
      const records = await db
        .select()
        .from(recordsTable)
        .where(and(eq(recordsTable.recordId, input), eq(recordsTable.userId, ctx.userId)))
        .orderBy(desc(recordsTable.version));
      return records.map(serializeRecord);
    }),

  create: protectedProcedure
    .input(createRecordInputSchema)
    .output(encryptedRecordSchema)
    .mutation(async ({ ctx, input }) => {
      const [record] = await db
        .insert(recordsTable)
        .values({
          ...input,
          userId: ctx.userId,
          clientUpdatedAt: new Date(input.clientUpdatedAt),
          version: 1,
        })
        .returning();
      if (!record) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      emitRecordsChanged(ctx.userId);
      return serializeRecord(record);
    }),

  update: protectedProcedure
    .input(updateRecordInputSchema)
    .output(encryptedRecordSchema)
    .mutation(async ({ ctx, input }) => {
      const { recordId, version, clientUpdatedAt, ...data } = input;

      const [current] = await db
        .select({ version: recordsTable.version, deletedAt: recordsTable.deleted_at })
        .from(recordsTable)
        .where(and(eq(recordsTable.recordId, recordId), eq(recordsTable.userId, ctx.userId)))
        .orderBy(desc(recordsTable.version))
        .limit(1);

      if (!current || current.deletedAt !== null) throw new TRPCError({ code: "NOT_FOUND" });
      if (current.version !== version) throw new TRPCError({ code: "CONFLICT" });

      const [record] = await db
        .insert(recordsTable)
        .values({
          recordId,
          userId: ctx.userId,
          ...data,
          version: version + 1,
          clientUpdatedAt: new Date(clientUpdatedAt),
        })
        .returning();
      if (!record) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      emitRecordsChanged(ctx.userId);
      return serializeRecord(record);
    }),

  delete: protectedProcedure.input(z.uuid()).mutation(async ({ ctx, input }) => {
    const [current] = await db
      .select()
      .from(recordsTable)
      .where(
        and(
          eq(recordsTable.recordId, input),
          eq(recordsTable.userId, ctx.userId),
          isNull(recordsTable.deleted_at),
        ),
      )
      .orderBy(desc(recordsTable.version))
      .limit(1);

    if (!current) throw new TRPCError({ code: "NOT_FOUND" });

    await db.insert(recordsTable).values({
      recordId: input,
      userId: ctx.userId,
      encryptedData: current.encryptedData,
      encryptionNonce: current.encryptionNonce,
      cryptoVersion: current.cryptoVersion,
      clientUpdatedAt: current.clientUpdatedAt,
      version: current.version + 1,
      deleted_at: new Date(),
    });

    emitRecordsChanged(ctx.userId);
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
