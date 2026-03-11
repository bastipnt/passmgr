import { router } from "../trpc";
import z from "zod";
import { protectedProcedure } from "../auth/authMiddleware";
import {
  createItemInputSchema,
  updateItemInputSchema,
  encryptedItemSchema,
  syncInputSchema,
  syncOutputSchema,
} from "@repo/schema";
import { db, type ItemType, itemsTable } from "@repo/db";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

function serializeItem(item: ItemType) {
  const { rowId: _rowId, userId: _userId, ...rest } = item;
  return {
    ...rest,
    clientUpdatedAt: item.clientUpdatedAt.toISOString(),
    created_at: item.created_at?.toISOString() ?? null,
    updated_at: item.updated_at.toISOString(),
    deleted_at: item.deleted_at?.toISOString() ?? null,
  };
}

export const entryRouter = router({
  sync: protectedProcedure
    .input(syncInputSchema)
    .output(syncOutputSchema)
    .query(async ({ ctx, input }) => {
      const serverTimestamp = new Date().toISOString();

      const conditions = [eq(itemsTable.userId, ctx.userId)];
      if (input.lastSyncedAt) {
        conditions.push(gt(itemsTable.updated_at, new Date(input.lastSyncedAt)));
      }

      const items = await db
        .select()
        .from(itemsTable)
        .where(and(...conditions))
        .orderBy(itemsTable.itemId, desc(itemsTable.version));

      return { items: items.map(serializeItem), serverTimestamp };
    }),

  all: protectedProcedure
    .output(z.object({ items: z.array(encryptedItemSchema) }))
    .query(async ({ ctx }) => {
      // DISTINCT ON gets the latest version (highest) per itemId, then filter out deleted
      const latestPerItem = db
        .selectDistinctOn([itemsTable.itemId])
        .from(itemsTable)
        .where(eq(itemsTable.userId, ctx.userId))
        .orderBy(itemsTable.itemId, desc(itemsTable.version))
        .as("latest_per_item");

      const items = await db.select().from(latestPerItem).where(isNull(latestPerItem.deleted_at));

      return { items: items.map(serializeItem) };
    }),

  getById: protectedProcedure
    .input(z.uuid())
    .output(encryptedItemSchema)
    .query(async ({ ctx, input }) => {
      const latestForItem = db
        .selectDistinctOn([itemsTable.itemId])
        .from(itemsTable)
        .where(and(eq(itemsTable.itemId, input), eq(itemsTable.userId, ctx.userId)))
        .orderBy(itemsTable.itemId, desc(itemsTable.version))
        .as("latest_for_item");

      const [item] = await db.select().from(latestForItem).where(isNull(latestForItem.deleted_at));

      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      return serializeItem(item);
    }),

  history: protectedProcedure
    .input(z.uuid())
    .output(z.array(encryptedItemSchema))
    .query(async ({ ctx, input }) => {
      const items = await db
        .select()
        .from(itemsTable)
        .where(and(eq(itemsTable.itemId, input), eq(itemsTable.userId, ctx.userId)))
        .orderBy(desc(itemsTable.version));
      return items.map(serializeItem);
    }),

  create: protectedProcedure
    .input(createItemInputSchema)
    .output(encryptedItemSchema)
    .mutation(async ({ ctx, input }) => {
      const [item] = await db
        .insert(itemsTable)
        .values({
          ...input,
          userId: ctx.userId,
          clientUpdatedAt: new Date(input.clientUpdatedAt),
          version: 1,
        })
        .returning();
      if (!item) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return serializeItem(item);
    }),

  update: protectedProcedure
    .input(updateItemInputSchema)
    .output(encryptedItemSchema)
    .mutation(async ({ ctx, input }) => {
      const { itemId, version, clientUpdatedAt, ...data } = input;

      const [current] = await db
        .select({ version: itemsTable.version, deletedAt: itemsTable.deleted_at })
        .from(itemsTable)
        .where(and(eq(itemsTable.itemId, itemId), eq(itemsTable.userId, ctx.userId)))
        .orderBy(desc(itemsTable.version))
        .limit(1);

      if (!current || current.deletedAt !== null) throw new TRPCError({ code: "NOT_FOUND" });
      if (current.version !== version) throw new TRPCError({ code: "CONFLICT" });

      const [item] = await db
        .insert(itemsTable)
        .values({
          itemId,
          userId: ctx.userId,
          ...data,
          version: version + 1,
          clientUpdatedAt: new Date(clientUpdatedAt),
        })
        .returning();
      if (!item) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return serializeItem(item);
    }),

  delete: protectedProcedure.input(z.uuid()).mutation(async ({ ctx, input }) => {
    const [current] = await db
      .select()
      .from(itemsTable)
      .where(
        and(
          eq(itemsTable.itemId, input),
          eq(itemsTable.userId, ctx.userId),
          isNull(itemsTable.deleted_at),
        ),
      )
      .orderBy(desc(itemsTable.version))
      .limit(1);

    if (!current) throw new TRPCError({ code: "NOT_FOUND" });

    await db.insert(itemsTable).values({
      itemId: input,
      userId: ctx.userId,
      encryptedData: current.encryptedData,
      encryptionNonce: current.encryptionNonce,
      cryptoVersion: current.cryptoVersion,
      clientUpdatedAt: current.clientUpdatedAt,
      version: current.version + 1,
      deleted_at: new Date(),
    });
  }),
});
